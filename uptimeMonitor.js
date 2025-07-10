// UptimeRobot monitoring module
// This module handles ping requests from UptimeRobot to keep the Render service alive

const express = require('express');

// Statistics tracking
let pingStats = {
  totalPings: 0,
  lastPingTime: null,
  startTime: new Date(),
  uptimeMinutes: 0
};

// Function to format time nicely
function formatTime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

// Function to calculate uptime
function calculateUptime() {
  const now = new Date();
  const uptimeMs = now.getTime() - pingStats.startTime.getTime();
  return Math.floor(uptimeMs / (1000 * 60)); // Convert to minutes
}

// Function to log ping with stats
function logPing(req) {
  pingStats.totalPings++;
  pingStats.lastPingTime = new Date();
  pingStats.uptimeMinutes = calculateUptime();
  
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress || 'Unknown';
  
  // Detect if it's UptimeRobot
  const isUptimeRobot = userAgent.toLowerCase().includes('uptimerobot') || 
                       userAgent.toLowerCase().includes('uptime');
  
  console.log('🔄 ====== PING RECEIVED ======');
  console.log(`📊 Ping #${pingStats.totalPings}`);
  console.log(`⏰ Time: ${formatTime(pingStats.lastPingTime)}`);
  console.log(`🕐 Uptime: ${pingStats.uptimeMinutes} minutes`);
  console.log(`🌐 IP: ${ip}`);
  console.log(`🤖 User-Agent: ${userAgent}`);
  console.log(`${isUptimeRobot ? '✅ UptimeRobot detected!' : '❓ Unknown ping source'}`);
  console.log('🔄 ============================');
  
  return {
    isUptimeRobot,
    stats: { ...pingStats }
  };
}

// Function to get current stats
function getStats() {
  return {
    ...pingStats,
    uptimeMinutes: calculateUptime(),
    serverStartTime: pingStats.startTime,
    isAlive: true
  };
}

// Function to setup ping routes
function setupPingRoutes(app) {
  // Main ping endpoint for UptimeRobot
  app.get("/ping", (req, res) => {
    const pingInfo = logPing(req);
    
    res.json({
      status: "🟢 Bot is alive!",
      message: "Telegram Zoho Bot is running smoothly",
      timestamp: new Date().toISOString(),
      uptime_minutes: pingInfo.stats.uptimeMinutes,
      total_pings: pingInfo.stats.totalPings,
      source: pingInfo.isUptimeRobot ? "UptimeRobot" : "Unknown",
      server_info: {
        node_version: process.version,
        memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB"
      }
    });
  });
  
  // Alternative ping endpoint
  app.get("/keepalive", (req, res) => {
    const pingInfo = logPing(req);
    
    res.send(`🟢 Server is alive! Uptime: ${pingInfo.stats.uptimeMinutes} minutes | Pings: ${pingInfo.stats.totalPings}`);
  });
  
  // Health check with ping stats
  app.get("/health-ping", (req, res) => {
    const stats = getStats();
    
    res.json({
      status: "healthy",
      service: "telegram-zoho-bot",
      uptime_info: {
        uptime_minutes: stats.uptimeMinutes,
        server_start_time: stats.serverStartTime,
        last_ping_time: stats.lastPingTime,
        total_pings: stats.totalPings
      },
      timestamp: new Date().toISOString()
    });
  });
  
  // Ping statistics dashboard
  app.get("/ping-stats", (req, res) => {
    const stats = getStats();
    
    res.json({
      title: "🔄 UptimeRobot Ping Statistics",
      statistics: {
        total_pings_received: stats.totalPings,
        server_uptime_minutes: stats.uptimeMinutes,
        server_uptime_hours: Math.round(stats.uptimeMinutes / 60 * 100) / 100,
        server_start_time: formatTime(stats.serverStartTime),
        last_ping_time: stats.lastPingTime ? formatTime(stats.lastPingTime) : "No pings yet",
        average_ping_interval: stats.totalPings > 1 ? 
          Math.round(stats.uptimeMinutes / stats.totalPings * 100) / 100 + " minutes" : 
          "Not enough data"
      },
      server_status: {
        is_alive: true,
        memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
        node_version: process.version,
        current_time: formatTime(new Date())
      },
      recommendations: {
        uptimerobot_setup: "Set interval to 5 minutes for optimal performance",
        monitor_url: "Use /ping endpoint for monitoring",
        stats_url: "Check /ping-stats for detailed statistics"
      }
    });
  });
  
  console.log('✅ UptimeRobot ping monitoring routes configured');
  console.log('📍 Available endpoints:');
  console.log('   • GET /ping - Main UptimeRobot endpoint');
  console.log('   • GET /keepalive - Alternative ping endpoint');
  console.log('   • GET /health-ping - Health check with ping stats');
  console.log('   • GET /ping-stats - Detailed ping statistics');
}

// Function to log server startup
function logServerStart() {
  console.log('🚀 ====== SERVER STARTUP ======');
  console.log(`⏰ Start Time: ${formatTime(pingStats.startTime)}`);
  console.log('🔄 UptimeRobot monitoring initialized');
  console.log('📊 Ping statistics tracking enabled');
  console.log('🚀 ==============================');
}

// Export functions
module.exports = {
  setupPingRoutes,
  logServerStart,
  getStats,
  logPing
};
