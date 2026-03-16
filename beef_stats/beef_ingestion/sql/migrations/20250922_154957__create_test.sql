CREATE TABLE IF NOT EXISTS "test" (
            id BIGSERIAL PRIMARY KEY,
            url TEXT UNIQUE NOT NULL,
            date_added DATE NOT NULL
        );
