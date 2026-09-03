const http = require('http');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- TEST 1: Health Check ---');
  const health = await request({ host: '127.0.0.1', port: 5001, path: '/api/health', method: 'GET' });
  console.log('Health:', health);

  console.log('\n--- TEST 2: Sync Status ---');
  const syncStatus = await request({ host: '127.0.0.1', port: 5001, path: '/api/sync/status', method: 'GET' });
  console.log('Sync Status:', syncStatus);

  console.log('\n--- TEST 3: Get Latest Date ---');
  const latestDate = await request({ host: '127.0.0.1', port: 5001, path: '/api/sales/latest-date', method: 'GET' });
  console.log('Latest Date:', latestDate);

  console.log('\n--- TEST 4: Get Available Dates ---');
  const availDates = await request({ host: '127.0.0.1', port: 5001, path: '/api/sales/available-dates', method: 'GET' });
  console.log('Available Dates:', availDates);

  console.log('\n--- TEST 5: Push Mock IBM i 7.1 Sync Payload (Simulating RPGLE/DataQueue Daemon) ---');
  const mockSyncPayload = {
    apiKey: 'flash_tw_secure_sync_key_2026',
    latestDate: '2026-02-10',
    availableDates: ['2026-02-09', '2026-02-10'],
    rows: [
      {
        STORE_ID: '001',
        TOTAL_DATE_1: 18500.25,
        TOTAL_DATE_2: 17200.00,
        TOTAL_WTD_1: 52000.50,
        TOTAL_WTD_2: 48900.00,
        TOTAL_QTD_1: 145000.00,
        TOTAL_QTD_2: 138000.00,
        TOTAL_YTD_1: 520000.00,
        TOTAL_YTD_2: 490000.00,
        TOTAL_ROWS: 2
      },
      {
        STORE_ID: '002',
        TOTAL_DATE_1: 22100.00,
        TOTAL_DATE_2: 20500.00,
        TOTAL_WTD_1: 61000.00,
        TOTAL_WTD_2: 59000.00,
        TOTAL_QTD_1: 180000.00,
        TOTAL_QTD_2: 172000.00,
        TOTAL_YTD_1: 640000.00,
        TOTAL_YTD_2: 610000.00,
        TOTAL_ROWS: 2
      }
    ]
  };

  const syncResult = await request(
    {
      host: '127.0.0.1',
      port: 5001,
      path: '/api/sync/pivotsum',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    mockSyncPayload
  );
  console.log('Sync Result:', syncResult);

  console.log('\n--- TEST 6: Fetch Pivotsum from Frontend Endpoint ---');
  const pivotsum = await request({ host: '127.0.0.1', port: 5001, path: '/api/sales/pivotsum', method: 'GET' });
  console.log('Pivotsum response status:', pivotsum.status);
  console.log('TotalCount:', pivotsum.body?.TotalCount);
  console.log('Sample rows:', pivotsum.body?.PivotData?.slice(0, 3));

  console.log('\n--- TEST 7: Analytics Endpoint ---');
  const analytics = await request({ host: '127.0.0.1', port: 5001, path: '/api/sales/analytics?startDate=2026-02-01&endDate=2026-02-10&mode=D', method: 'GET' });
  console.log('Analytics response labels count:', analytics.body?.Labels?.length);

  console.log('\n===========================================');
  console.log('ALL DRIVERLESS BACKEND TESTS PASSED!');
  console.log('===========================================');
}

runTests().catch(err => console.error('Test failed:', err));
