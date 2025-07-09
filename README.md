# Telegram Zoho CRM Bot

# Telegram Zoho CRM Bot

A Telegram bot that integrates with Zoho CRM to fetch leads and manage customer data.

## Features

- **🔗 `/connect`** - Connect your Zoho CRM account with OAuth2 authentication
- **📋 `/leads`** - Fetch latest leads from your Zoho CRM

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- Supabase account (for database)
- Telegram Bot Token
- Zoho CRM account

### 2. Database Setup

1. Create a Supabase project
2. Run the SQL commands from `setup.sql` in your Supabase SQL editor
3. Copy your DATABASE_URL from Supabase settings

### 3. Environment Variables

Set these environment variables in Render:

- `TELEGRAM_TOKEN` - Your Telegram bot token from @BotFather
- `DATABASE_URL` - Your Supabase PostgreSQL connection string

### 4. Deployment

1. Push this code to your GitHub repository
2. Connect your Render web service to the repository
3. Set the environment variables in Render
4. Deploy!

### 5. Usage

1. Start a chat with your bot
2. Send `/connect` to link your Zoho CRM
3. Follow the instructions to complete OAuth2 setup
4. Use `/leads` to fetch your latest CRM leads

## How OAuth2 Flow Works

1. User sends `/connect` command
2. Bot provides Zoho API Console instructions
3. User creates Self Client and generates authorization code
4. User pastes the JSON content back to the bot
5. Bot exchanges authorization code for access/refresh tokens
6. Tokens are securely stored in database with user's chat ID
7. Future API calls use stored tokens (with automatic refresh)

## Files Structure

- `index.js` - Main bot application
- `db.js` - Database connection configuration
- `tokenRepo.js` - Token management helper functions
- `setup.sql` - Database table creation script
- `.env.example` - Environment variables example

## Deployment

This bot is designed to be deployed on Render.com as a web service.

## Environment Variables

- `BOT_TOKEN` - Your Telegram bot token
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon key
