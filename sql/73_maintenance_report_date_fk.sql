DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'beef_data'
          AND table_name = 'maintenance_entries'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'beef_data'
          AND table_name = 'maintenance_entries'
          AND constraint_name = 'fk_maintenance_entries_report_date'
    ) THEN
        ALTER TABLE beef_data.maintenance_entries
            ADD CONSTRAINT fk_maintenance_entries_report_date
            FOREIGN KEY (report_date)
            REFERENCES beef_data.report_dates(report_date)
            ON UPDATE CASCADE;
    END IF;
END
$$;
