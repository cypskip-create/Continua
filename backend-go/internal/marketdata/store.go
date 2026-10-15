package marketdata

import (
	"context"
	"continua/backend/internal/auth"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"strings"
	"time"
)

type Store struct {
	DB                  *sql.DB
	AllowUnreviewed     bool
	DurableQuoteRefresh bool
}

func (s *Store) EffectivePlan(ctx context.Context, id string) (string, error) {
	var plan sql.NullString
	err := s.DB.QueryRowContext(ctx, `SELECT public.effective_subscription_plan($1)`, id).Scan(&plan)
	if err != nil {
		return "", err
	}
	if !plan.Valid {
		return "free", nil
	}
	return plan.String, nil
}

func (s *Store) FindActiveKey(ctx context.Context, hash string) (*auth.APIKey, error) {
	var key auth.APIKey
	err := s.DB.QueryRowContext(ctx, `SELECT id,name,active,rate_limit_per_min FROM market.api_keys WHERE key_hash=$1 AND active=true`, hash).Scan(&key.ID, &key.Name, &key.Active, &key.RateLimitPerMin)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &key, nil
}
func (s *Store) TouchKey(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE market.api_keys SET last_used_at=now() WHERE id=$1`, id)
	return err
}
func (s *Store) Ping(ctx context.Context) error { return s.DB.PingContext(ctx) }

const quoteColumns = `q.security_id AS "securityId",q.symbol,q.exchange,q.last_price AS "lastPrice",q.open,q.high,q.low,q.previous_close AS "previousClose",q.change,q.change_percent AS "changePercent",q.volume,q.bid,q.ask,q.market_cap AS "marketCap",q.currency,q.status,to_char(q.event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp",q.source`

func (s *Store) Quotes(ctx context.Context, exchange string, symbols []string) ([]json.RawMessage, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT row_to_json(result) FROM (SELECT `+quoteColumns+` FROM market.live_quotes q JOIN market.securities s ON s.id=q.security_id WHERE s.exchange=$1 AND s.status<>'delisted' AND s.symbol=ANY($2)) result`, exchange, symbols)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var row json.RawMessage
		if err := rows.Scan(&row); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
func (s *Store) Sectors(ctx context.Context) ([]json.RawMessage, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT row_to_json(result) FROM (SELECT id,name FROM market.sectors ORDER BY name) result`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var row json.RawMessage
		if err := rows.Scan(&row); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) Instruments(ctx context.Context, exchange string) ([]json.RawMessage, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT row_to_json(result) FROM (
 SELECT s.symbol,s.id AS "securityId",c.name AS "companyName",sec.name AS sector,s.currency,s.status,s.isin
 FROM market.securities s JOIN market.companies c ON c.id=s.company_id
 LEFT JOIN market.sectors sec ON sec.id=c.sector_id
 WHERE s.exchange=$1 AND s.status<>'delisted' ORDER BY s.symbol) result`, exchange)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var row json.RawMessage
		if err := rows.Scan(&row); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
func Open(connection string) (*Store, error) {
	config, err := nativeConnectionConfig(connection)
	if err != nil {
		return nil, err
	}
	db := stdlib.OpenDB(*config)
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	db.SetConnMaxIdleTime(30 * time.Second)
	db.SetConnMaxLifetime(30 * time.Minute)
	return &Store{DB: db}, nil
}

func nativeConnectionConfig(connection string) (*pgx.ConnConfig, error) {
	config, err := pgx.ParseConfig(connection)
	if err != nil {
		return nil, err
	}
	// Supavisor transaction pooling cannot retain named prepared statements.
	// Simple protocol uses pgx's own safe parameter encoding, including UUID
	// strings/arrays whose types PostgreSQL must infer from the SQL context.
	config.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	config.ConnectTimeout = 10 * time.Second
	local := config.Host == "localhost" || config.Host == "127.0.0.1" || config.Host == "::1" || strings.HasPrefix(config.Host, "/")
	if !local {
		if config.TLSConfig == nil {
			return nil, errors.New("Remote database requires verified TLS")
		}
		config.TLSConfig = config.TLSConfig.Clone()
		config.TLSConfig.RootCAs, err = databaseRoots(config.Host, config.TLSConfig.RootCAs)
		if err != nil {
			return nil, err
		}
		config.TLSConfig.InsecureSkipVerify = false
		config.TLSConfig.ServerName = config.Host
		config.TLSConfig.MinVersion = tls.VersionTLS12
		fallbacks := config.Fallbacks[:0]
		for _, fallback := range config.Fallbacks {
			if fallback.TLSConfig == nil {
				continue
			}
			copy := *fallback
			copy.TLSConfig = fallback.TLSConfig.Clone()
			copy.TLSConfig.RootCAs, err = databaseRoots(copy.Host, copy.TLSConfig.RootCAs)
			if err != nil {
				return nil, err
			}
			copy.TLSConfig.InsecureSkipVerify = false
			copy.TLSConfig.ServerName = copy.Host
			copy.TLSConfig.MinVersion = tls.VersionTLS12
			fallbacks = append(fallbacks, &copy)
		}
		config.Fallbacks = fallbacks
	}
	return config, nil
}
