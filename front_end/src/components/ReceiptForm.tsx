import React, { useState } from 'react';
import axios from 'axios';

interface ReceiptItem {
  item_name: string;
  quantity: number;
  unit_price: number;
}

interface FuelReceiptPayload {
  report_date: string;
  receipt_time: string | null;
  fuel_type: string;
  gallons: number;
  price_per_gallon: number;
  gas_station_name: string;
  address: string | null;
}

const ReceiptForm: React.FC = () => {
  const [receiptDate, setReceiptDate] = useState('');
  const [storeName, setStoreName] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [items, setItems] = useState<ReceiptItem[]>([{ item_name: '', quantity: 0, unit_price: 0 }]);

  const handleItemChange = (index: number, field: keyof ReceiptItem, value: string) => {
    const newItems = [...items];
    (newItems[index][field] as any) = field === 'item_name' ? value : parseFloat(value);
    setItems(newItems);
  };

  const handleAddItem = () => {
    setItems([...items, { item_name: '', quantity: 0, unit_price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const primaryItem = items[0];

    const payload: FuelReceiptPayload = {
      report_date: receiptDate,
      receipt_time: null,
      fuel_type: primaryItem?.item_name || 'fuel',
      gas_station_name: storeName,
      address: null,
      gallons: Number(primaryItem?.quantity ?? 0),
      price_per_gallon: Number(primaryItem?.unit_price ?? 0),
    };

    try {
      await axios.post('/api/receipts', payload);
      alert('Receipt submitted successfully!');
      // Clear form
      setReceiptDate('');
      setStoreName('');
      setTotalAmount(0);
      setItems([{ item_name: '', quantity: 0, unit_price: 0 }]);
    } catch (error) {
      console.error('Error submitting receipt:', error);
      alert('Failed to submit receipt.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded shadow-md">
      <h2 className="text-xl font-bold mb-4">Submit New Receipt</h2>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="receiptDate">
          Receipt Date:
        </label>
        <input
          type="date"
          id="receiptDate"
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={receiptDate}
          onChange={(e) => setReceiptDate(e.target.value)}
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="storeName">
          Store Name:
        </label>
        <input
          type="text"
          id="storeName"
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="totalAmount">
          Total Amount:
        </label>
        <input
          type="number"
          id="totalAmount"
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={totalAmount}
          onChange={(e) => setTotalAmount(parseFloat(e.target.value))}
          step="0.01"
          required
        />
      </div>
      <h3 className="text-lg font-semibold mb-2">Items:</h3>
      {items.map((item, index) => (
        <div key={index} className="flex space-x-2 mb-2">
          <input
            type="text"
            placeholder="Item Name"
            className="shadow appearance-none border rounded w-1/2 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={item.item_name}
            onChange={(e) => handleItemChange(index, 'item_name', e.target.value)}
            required
          />
          <input
            type="number"
            placeholder="Quantity"
            className="shadow appearance-none border rounded w-1/4 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={item.quantity}
            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
            step="0.01"
            required
          />
          <input
            type="number"
            placeholder="Unit Price"
            className="shadow appearance-none border rounded w-1/4 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            value={item.unit_price}
            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
            step="0.01"
            required
          />
          <button type="button" onClick={() => handleRemoveItem(index)} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAddItem} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mb-4">
        Add Item
      </button>
      <button type="submit" className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
        Submit Receipt
      </button>
    </form>
  );
};

export default ReceiptForm;
