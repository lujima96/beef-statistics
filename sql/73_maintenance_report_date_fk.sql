ALTER TABLE IF EXISTS beef_data.maintenance_entries
    ADD CONSTRAINT IF NOT EXISTS fk_maintenance_entries_report_date
    FOREIGN KEY (report_date)
    REFERENCES beef_data.report_dates(report_date)
    ON UPDATE CASCADE;

