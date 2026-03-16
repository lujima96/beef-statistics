CREATE TABLE IF NOT EXISTS beef_data."test" (
            id BIGSERIAL PRIMARY KEY,
            url TEXT NOT NULL,
            report_date DATE NOT NULL REFERENCES beef_data.report_dates(report_date),
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE (url, report_date)
        );
