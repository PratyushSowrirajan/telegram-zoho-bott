const axios = require('axios');

const TEST_TOKEN = "1000.caea110dcf13032965c5f65befcd3e8c.d0e10072e774474fb592f454626730da";

async function testScopes() {
  console.log("🔍 Testing different API endpoints to identify scope issues...");
  
  const endpoints = [
    { name: 'User Info (US)', url: 'https://www.zohoapis.com/crm/v2/users' },
    { name: 'User Info (IN)', url: 'https://www.zohoapis.in/crm/v2/users' },
    { name: 'Settings (US)', url: 'https://www.zohoapis.com/crm/v2/settings/modules' },
    { name: 'Settings (IN)', url: 'https://www.zohoapis.in/crm/v2/settings/modules' },
    { name: 'Org Info (US)', url: 'https://www.zohoapis.com/crm/v2/org' },
    { name: 'Org Info (IN)', url: 'https://www.zohoapis.in/crm/v2/org' },
    { name: 'Leads (US)', url: 'https://www.zohoapis.com/crm/v2/Leads?per_page=1' },
    { name: 'Leads (IN)', url: 'https://www.zohoapis.in/crm/v2/Leads?per_page=1' }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n🧪 Testing: ${endpoint.name}`);
    try {
      const response = await axios.get(endpoint.url, {
        headers: { 
          Authorization: `Zoho-oauthtoken ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ SUCCESS: ${endpoint.name}`);
      console.log(`📊 Status: ${response.status}`);
      console.log(`📊 Data keys: ${Object.keys(response.data || {}).join(', ')}`);
      
      // If we get a successful response, this is the right region!
      if (endpoint.name.includes('Leads')) {
        console.log(`\n🎉 FOUND WORKING REGION FOR LEADS!`);
        console.log(`🔗 Working URL: ${endpoint.url}`);
        console.log(`🌍 Region: ${endpoint.name.includes('US') ? 'US (.com)' : 'India (.in)'}`);
        return;
      }
      
    } catch (error) {
      console.log(`❌ FAILED: ${endpoint.name}`);
      console.log(`   Status: ${error.response?.status || 'No status'}`);
      console.log(`   Error: ${error.response?.data?.message || error.message}`);
      console.log(`   Code: ${error.response?.data?.code || 'No code'}`);
    }
  }
}

testScopes().catch(console.error);
