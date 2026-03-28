import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 2,        // 2 virtual users
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],       // <5% errors
    http_req_duration: ['p(95)<2000'],    // 95% of requests under 2s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const DEALER_ID = __ENV.DEALER_ID || 'a1000000-0000-0000-0000-000000000001';

export default function () {
  // Health check
  let r = http.get(`${BASE_URL}/api/health`);
  check(r, { 'health: status 200 or 503': (res) => [200, 503].includes(res.status) });

  // Inventory browse
  r = http.get(`${BASE_URL}/api/inventory`);
  check(r, { 'inventory: status 200': (res) => res.status === 200 });

  // VDP (nonexistent VIN should 404/503, not 500)
  r = http.get(`${BASE_URL}/api/inventory/ZZZSHADOW0000099Z?dealer_id=${DEALER_ID}`);
  check(r, { 'VDP: not 500': (res) => res.status !== 500 });

  sleep(1);
}
