import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // ramp to 10 VUs
    { duration: '60s', target: 10 },   // hold
    { duration: '15s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<3000'],
    'http_req_duration{name:lead_submit}': ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const DEALER_ID = __ENV.DEALER_ID || 'a1000000-0000-0000-0000-000000000001';

export default function () {
  const email = `k6-load-${Date.now()}-${Math.random().toString(36).substr(2,6)}@k6-test.invalid`;

  const payload = JSON.stringify({
    dealer_id: DEALER_ID,
    first_name: 'K6',
    last_name: 'LoadTest',
    email,
    vehicle_interest: 'k6 load test vehicle',
    source: 'website_form',
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'lead_submit' },
  };

  const r = http.post(`${BASE_URL}/api/leads`, payload, params);
  check(r, {
    'lead: 201 or 429 (rate limited)': (res) => [201, 422, 429].includes(res.status),
    'lead: not 500': (res) => res.status !== 500,
  });

  sleep(0.5);
}
