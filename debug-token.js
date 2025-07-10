const axios = require('axios');

// Your fresh access token
const TEST_TOKEN = "1000.caea110dcf13032965c5f65befcd3e8c.d0e10072e774474fb592f454626730da";

async function testZohoToken() {
  console.log("🧪 Testing Zoho OAuth Token...");
  console.log(`🔑 Token: ${TEST_TOKEN.substring(0, 20)}...`);
  console.log(`📏 Token length: ${TEST_TOKEN.length}`);
  console.log(`🔤 Token starts with: ${TEST_TOKEN.substring(0, 10)}`);
  console.log(`🔤 Token ends with: ${TEST_TOKEN.substring(TEST_TOKEN.length - 10)}`);
  
  // Test different regions
  const regions = [
    { name: 'India', url: 'https://www.zohoapis.in' },
    { name: 'US', url: 'https://www.zohoapis.com' },
    { name: 'Europe', url: 'https://www.zohoapis.eu' },
    { name: 'Australia', url: 'https://www.zohoapis.com.au' }
  ];
  
  for (const region of regions) {
    console.log(`\n🧪 Testing ${region.name} region (${region.url})`);
    try {
      const orgResponse = await axios.get(`${region.url}/crm/v2/org`, {
        headers: { 
          Authorization: `Zoho-oauthtoken ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ ${region.name} API call successful!`);
      console.log(`📊 Status: ${orgResponse.status}`);
      console.log(`📊 Org Name: ${orgResponse.data.org?.[0]?.company_name || 'N/A'}`);
      
      // If successful, test leads too
      console.log(`🧪 Testing leads in ${region.name}...`);
      const leadsResponse = await axios.get(`${region.url}/crm/v2/Leads`, {
        headers: { 
          Authorization: `Zoho-oauthtoken ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        params: {
          sort_by: 'Created_Time',
          sort_order: 'desc',
          per_page: 5
        },
        timeout: 10000
      });
      
      console.log(`✅ ${region.name} Leads API successful!`);
      console.log(`📊 Lead count: ${leadsResponse.data.data?.length || 0}`);
      
      return; // Stop testing if we find a working region
    } catch (error) {
      console.log(`❌ ${region.name} API failed:`);
      console.log(`Status: ${error.response?.status || 'No status'}`);
      console.log(`Error: ${error.response?.data?.message || error.message}`);
      console.log(`Code: ${error.response?.data?.code || 'No code'}`);
    }
  }
  
  // Test 2: Try to get leads (same as our bot)
  console.log("\n🧪 Test 2: Leads API");
  try {
    const leadsResponse = await axios.get('https://www.zohoapis.in/crm/v2/Leads', {
      headers: { 
        Authorization: `Zoho-oauthtoken ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        sort_by: 'Created_Time',
        sort_order: 'desc',
        per_page: 5
      },
      timeout: 10000
    });
    
    console.log("✅ Leads API call successful!");
    console.log(`📊 Status: ${leadsResponse.status}`);
    console.log(`📊 Lead count: ${leadsResponse.data.data?.length || 0}`);
    if (leadsResponse.data.data?.length > 0) {
      console.log(`📊 First lead: ${leadsResponse.data.data[0].First_Name || 'N/A'} ${leadsResponse.data.data[0].Last_Name || 'N/A'}`);
    }
  } catch (error) {
    console.log("❌ Leads API call failed:");
    console.log(`Status: ${error.response?.status || 'No status'}`);
    console.log(`Error: ${error.response?.data?.message || error.message}`);
    console.log(`Code: ${error.response?.data?.code || 'No code'}`);
    console.log(`Full error data:`, error.response?.data);
  }
  
  // Test 3: Try different API endpoint format
  console.log("\n🧪 Test 3: Alternative API endpoint");
  try {
    const altResponse = await axios.get('https://www.zohoapis.in/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5', {
      headers: { 
        Authorization: `Zoho-oauthtoken ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log("✅ Alternative API call successful!");
    console.log(`📊 Status: ${altResponse.status}`);
    console.log(`📊 Lead count: ${altResponse.data.data?.length || 0}`);
  } catch (error) {
    console.log("❌ Alternative API call failed:");
    console.log(`Status: ${error.response?.status || 'No status'}`);
    console.log(`Error: ${error.response?.data?.message || error.message}`);
    console.log(`Code: ${error.response?.data?.code || 'No code'}`);
  }
  
  // Test 4: Check token validity with minimal request
  console.log("\n🧪 Test 4: Token validation");
  try {
    const validationResponse = await axios.get('https://www.zohoapis.in/crm/v2/settings/modules', {
      headers: { 
        Authorization: `Zoho-oauthtoken ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log("✅ Token validation successful!");
    console.log(`📊 Status: ${validationResponse.status}`);
  } catch (error) {
    console.log("❌ Token validation failed:");
    console.log(`Status: ${error.response?.status || 'No status'}`);
    console.log(`Error: ${error.response?.data?.message || error.message}`);
    console.log(`Code: ${error.response?.data?.code || 'No code'}`);
  }
}

testZohoToken().catch(console.error);
