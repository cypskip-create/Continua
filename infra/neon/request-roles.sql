-- Runtime changes role for each browser transaction; it does not inherit
-- either role's privileges by default. This grants no login or public access.
GRANT anon TO neondb_owner WITH INHERIT FALSE, SET TRUE;
GRANT authenticated TO neondb_owner WITH INHERIT FALSE, SET TRUE;
