import { pool, withTransaction } from './db';
import type { CallOutcome, DeliveryStatus } from './types';

interface Sample {
  orderId: string;
  name: string;
  phone: string;
  product: string;
  date: string;
  status: DeliveryStatus;
  outcome?: CallOutcome;
  rawInput?: string;
  lastCallHoursAgo?: number;
}

const samples: Sample[] = [
  { orderId: 'ORD-10421', name: 'Aarav Sharma', phone: '+919812345678', product: 'Wireless Headphones', date: '2026-11-24', status: 'not_called' },
  { orderId: 'ORD-10422', name: 'Priya Mehta', phone: '+919876543210', product: 'Smart Watch', date: '2026-11-24', status: 'not_called' },
  { orderId: 'ORD-10423', name: 'Rohan Verma', phone: '+919900112233', product: 'Blender 500W', date: '2026-11-23', status: 'not_called' },
  { orderId: 'ORD-10424', name: 'Ananya Iyer', phone: '+919923456781', product: 'Coffee Maker', date: '2026-11-23', status: 'calling', outcome: 'pending', lastCallHoursAgo: 0.05 },
  { orderId: 'ORD-10425', name: 'Vikram Singh', phone: '+919812300456', product: 'Bluetooth Speaker', date: '2026-11-22', status: 'received', outcome: 'received', rawInput: '1', lastCallHoursAgo: 3 },
  { orderId: 'ORD-10426', name: 'Neha Kapoor', phone: '+919887766554', product: 'Air Purifier', date: '2026-11-22', status: 'received', outcome: 'received', rawInput: 'Yes', lastCallHoursAgo: 5 },
  { orderId: 'ORD-10427', name: 'Kabir Khan', phone: '+919911223344', product: 'Kitchen Knife Set', date: '2026-11-21', status: 'not_received', outcome: 'not_received', rawInput: '2', lastCallHoursAgo: 26 },
  { orderId: 'ORD-10428', name: 'Sneha Rao', phone: '+919934455667', product: 'Yoga Mat', date: '2026-11-21', status: 'not_received', outcome: 'not_received', rawInput: 'No', lastCallHoursAgo: 28 },
  { orderId: 'ORD-10429', name: 'Arjun Nair', phone: '+919822334455', product: 'Power Bank 20000mAh', date: '2026-11-20', status: 'no_answer_failed', outcome: 'no_answer_failed', lastCallHoursAgo: 30 },
  { orderId: 'ORD-10430', name: 'Diya Patel', phone: '+919877665544', product: 'Desk Lamp', date: '2026-11-20', status: 'no_answer_failed', outcome: 'no_input', lastCallHoursAgo: 32 },
  { orderId: 'ORD-10431', name: 'Meera Joshi', phone: '+919966778899', product: 'Women’s Wallet', date: '2026-11-19', status: 'received', outcome: 'received', rawInput: '1', lastCallHoursAgo: 50 },
  { orderId: 'ORD-10432', name: 'Rahul Bansal', phone: '+919800123456', product: 'Gardening Kit', date: '2026-11-19', status: 'not_called' },
  { orderId: 'ORD-10433', name: 'Ishita Bose', phone: '+919912345678', product: 'Travel Backpack', date: '2026-11-18', status: 'received', outcome: 'received', rawInput: '1', lastCallHoursAgo: 74 },
  { orderId: 'ORD-10434', name: 'Dev Malhotra', phone: '+919945612378', product: 'Car Vacuum Cleaner', date: '2026-11-18', status: 'no_answer_failed', outcome: 'no_answer_failed', lastCallHoursAgo: 76 },
  { orderId: 'ORD-10435', name: 'Tara Ghosh', phone: '+919833445566', product: 'Electric Kettle', date: '2026-11-17', status: 'not_called' },
];

async function main(): Promise<void> {
  let inserted = 0;

  await withTransaction(async (client) => {
    for (const sample of samples) {
      const lastCall = sample.lastCallHoursAgo
        ? new Date(Date.now() - sample.lastCallHoursAgo * 3_600_000).toISOString()
        : null;

      const delivery = await client.query<{ id: string }>(
        `INSERT INTO deliveries
           (order_id, customer_name, phone_e164, product, delivery_date, status, last_call_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (order_id) DO NOTHING
         RETURNING id`,
        [sample.orderId, sample.name, sample.phone, sample.product, sample.date, sample.status, lastCall],
      );

      if (delivery.rowCount === 0) continue;
      inserted += 1;

      if (sample.outcome) {
        const started = lastCall ?? new Date().toISOString();
        await client.query(
          `INSERT INTO call_logs
             (delivery_id, provider_call_id, started_at, ended_at, duration_seconds,
              outcome, raw_input, provider_status, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            delivery.rows[0].id,
            `seed-${sample.orderId.toLowerCase()}`,
            started,
            new Date(new Date(started).getTime() + 25_000).toISOString(),
            25,
            sample.outcome,
            sample.rawInput ?? null,
            'completed',
            JSON.stringify({ source: 'seed', orderId: sample.orderId }),
          ],
        );
      }
    }
  });

  console.log(`Seed complete: ${inserted} new delivery records (${samples.length - inserted} already present).`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
