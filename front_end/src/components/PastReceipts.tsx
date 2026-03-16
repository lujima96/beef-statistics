import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface FuelReceipt {
  receipt_id: number | null;
  report_date: string;
  receipt_time: string | null;
  fuel_type: string;
  gallons: number | null;
  price_per_gallon: number | null;
  address: string | null;
  gas_station_name: string;
  ingested_at: string | null;
}

const PastReceipts: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [receipts, setReceipts] = useState<FuelReceipt[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipts = async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/receipts/${selectedDate}`);
      setReceipts(response.data.receipts);
    } catch (err) {
      console.error('Error fetching receipts:', err);
      setError('Failed to fetch receipts.');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [selectedDate]);

  return (
    <div className="p-4 border rounded shadow-md">
      <h2 className="text-xl font-bold mb-4">Past Receipt Entries</h2>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="selectDate">
          Select Date:
        </label>
        <input
          type="date"
          id="selectDate"
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      {loading && <p>Loading receipts...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!loading && !error && receipts.length === 0 && selectedDate && (
        <p>No receipts found for {selectedDate}.</p>
      )}

      {!loading && !error && receipts.length > 0 && (
        <div>
          {receipts.map((receipt) => {
            const gallonsDisplay =
              typeof receipt.gallons === 'number' ? receipt.gallons.toFixed(3) : null;
            const priceDisplay =
              typeof receipt.price_per_gallon === 'number'
                ? receipt.price_per_gallon.toFixed(4)
                : null;
            const total =
              typeof receipt.gallons === 'number' && typeof receipt.price_per_gallon === 'number'
                ? receipt.gallons * receipt.price_per_gallon
                : null;

            return (
              <div
                key={receipt.receipt_id ?? `${receipt.report_date}-${receipt.gas_station_name}`}
                className="border p-3 mb-3 rounded"
              >
                <p><strong>Date:</strong> {receipt.report_date}</p>
                <p><strong>Time:</strong> {receipt.receipt_time ?? '—'}</p>
                <p><strong>Station:</strong> {receipt.gas_station_name}</p>
                <p><strong>Fuel Type:</strong> {receipt.fuel_type}</p>
                <p><strong>Gallons:</strong> {gallonsDisplay ?? '—'}</p>
                <p>
                  <strong>Price / Gal:</strong> {priceDisplay !== null ? `$${priceDisplay}` : '—'}
                </p>
                <p><strong>Total Cost:</strong> {total !== null ? `$${total.toFixed(2)}` : '—'}</p>
                <p><strong>Address:</strong> {receipt.address ?? '—'}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PastReceipts;
