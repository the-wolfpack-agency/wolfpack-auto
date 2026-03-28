import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const MAKES = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW'];
const CONDITIONS = ['new', 'used', 'certified'];

export default function () {
  const make = MAKES[Math.floor(Math.random() * MAKES.length)];
  const condition = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];

  // Random filter combination
  const r = http.get(`${BASE_URL}/api/inventory?make=${make}&condition=${condition}&page=1&page_size=12`);
  check(r, {
    'inventory filter: 200': (res) => res.status === 200,
    'inventory filter: has vehicles key': (res) => {
      try { return JSON.parse(res.body).hasOwnProperty('vehicles'); } catch { return false; }
    },
  });

  sleep(0.2);
}
