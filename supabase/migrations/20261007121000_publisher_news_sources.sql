-- New sources only. Preserve operators' existing enable/disable choices.
INSERT INTO scraping.sources(id,name,adapter,enabled,config,terms_url,robots_url,license,allowed_usage,redistribution_allowed,attribution_required)
SELECT id,name,'rss',true,jsonb_build_object('feedUrl',feed,'schedule','*/5 * * * *','requestsPerSecond',0.25,'concurrency',1,'maxItemsPerRun',60),
       'https://' || domain || '/', 'https://' || domain || '/robots.txt', 'Publisher RSS feed',
       'Attributed headlines and short public feed summaries, subject to robots.txt and publisher terms. No paywall bypass or full-article republication.',NULL,true
FROM (VALUES
 ('techtrendske-rss','TechTrends Kenya','techtrendske.co.ke','https://techtrendske.co.ke/feed/'),
 ('soko-directory-rss','Soko Directory','sokodirectory.com','https://sokodirectory.com/feed/'),
 ('business-daily-rss','Business Daily Africa','www.businessdailyafrica.com','https://www.businessdailyafrica.com/service/rss/bd/1939132/feed.rss')
) AS publishers(id,name,domain,feed)
ON CONFLICT(id) DO NOTHING;
