================================================
   FLEET SCHEDULER - SETUP INSTRUCTIONS
================================================

DEPLOY TO RAILWAY (access from anywhere - recommended)
======================================================

Step 1: Create accounts
  - Go to https://github.com and create a free account (if you don't have one)
  - Go to https://railway.app and sign up with your GitHub account

Step 2: Push this folder to GitHub
  - Go to https://github.com/new and create a new repository called "fleet-scheduler"
  - Upload all the files from this folder to that repository
    (you can drag and drop them on the GitHub page)

Step 3: Deploy on Railway
  1. Log into https://railway.app
  2. Click "New Project"
  3. Click "Deploy from GitHub Repo"
  4. Select your "fleet-scheduler" repository
  5. Railway will automatically detect it's a Node.js app and deploy it
  6. Go to Settings > Networking > Generate Domain
  7. You'll get a URL like: fleet-scheduler-production.up.railway.app

Step 4: Share with your team
  - Send that URL to everyone
  - They bookmark it and open it whenever they need the schedule
  - Changes sync live to everyone automatically

Cost: ~$5/month for a small team


RUN LOCALLY (same office network only)
=======================================

1. Install Node.js from https://nodejs.org (LTS version)
2. Open Command Prompt, navigate to this folder
3. Run: npm install
4. Run: npm start
5. Share the IP address shown with your team


HOW TO USE THE APP
==================

WEEKLY SCHEDULE TAB:
  - Click any cell to add a job
  - Fill in location, truck, trailer, time, equipment, notes
  - Click existing jobs to edit them
  - Red warnings appear if a truck is double-booked

PEOPLE TAB:
  - "Add" to add a new person
  - "Rename" to change someone's name
  - Dropdown to change their role
  - "Remove" to delete them (also removes their jobs)

TRUCKS & TRAILERS TAB:
  - "Add" to add a new truck or trailer
  - "Rename" to change the name (e.g. "Truck 1" -> "Unit 401")
  - Type dropdown to change vehicle type
  - "Disable" to mark out of service
  - "Remove" to delete entirely

ROUTE VIEW TAB:
  - See all locations for the week
  - Shows which drivers go where each day
  - Spot route optimization opportunities


DATA:
  - Saved automatically to data.json
  - Daily backups in the "backups" folder (kept 30 days)
  - To restore: rename a backup file to data.json
