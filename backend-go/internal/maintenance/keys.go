package maintenance

import (
	"context"
	"continua/backend/internal/auth"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

type CreatedKey struct {
	ID           string `json:"id"`
	PlaintextKey string `json:"plaintextKey"`
}

var regexpUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func ValidateKeyName(name string, rate int) error {
	if strings.TrimSpace(name) != name || name == "" || !utf8.ValidString(name) || utf8.RuneCountInString(name) > 200 || rate < 1 || rate > 100000 {
		return errors.New("invalid key name or rate limit")
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return errors.New("invalid key name")
		}
	}
	return nil
}

// CreateKey returns plaintext once; only the legacy-compatible scrypt hash is
// sent to PostgreSQL. It grants data access, never user/admin/Premium rights.
func CreateKey(ctx context.Context, db *sql.DB, name string, rate int) (CreatedKey, error) {
	var result CreatedKey
	if err := ValidateKeyName(name, rate); err != nil {
		return result, err
	}
	random := make([]byte, 24)
	if _, err := rand.Read(random); err != nil {
		return result, err
	}
	plaintext := "afk_" + hex.EncodeToString(random)
	hash, err := auth.HashKey(plaintext)
	if err != nil {
		return result, err
	}
	err = db.QueryRowContext(ctx, `INSERT INTO market.api_keys(key_hash,name,rate_limit_per_min) VALUES($1,$2,$3) RETURNING id`, hash, name, rate).Scan(&result.ID)
	if err != nil {
		return CreatedKey{}, errors.New("key creation failed")
	}
	result.PlaintextKey = plaintext
	return result, nil
}

func RevokeKey(ctx context.Context, db *sql.DB, id string) error {
	if err := ValidateKeyID(id); err != nil {
		return err
	}
	result, err := db.ExecContext(ctx, `UPDATE market.api_keys SET active=false WHERE id=$1`, id)
	if err != nil {
		return errors.New("key revocation failed")
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return errors.New("key ID not found")
	}
	return nil
}

func ValidateKeyID(id string) error {
	if !regexpUUID.MatchString(id) {
		return errors.New("invalid key ID")
	}
	return nil
}
