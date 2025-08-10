# crash_logger_replit_project
logging vars in crash game (1xbet) to make a ML model 


A simple Node.js-based crash game logger and prediction tool.  
Designed for running on **Replit** with persistent logging to CSV and optional machine learning prediction.

---

## Features
- Logs **every crash round** to a CSV with:
  - ISO timestamp
  - Total bets
  - Number of bettors
  - Total winnings
  - Crash multiplier (actual)
  - Repetition count
  - Predicted crash seed (optional)
  - Predicted crash cap (from your logic)
- Runs in the background on Replit (24/7 with UptimeRobot pinging)
- Simple dashboard (`public/index.html`) to visualize logs and predictions
- Optional ML model training to predict next crash multiplier based on history

---

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/familyguyd55-sys/crash_logger_replit_project.git
cd crash_logger_replit_project
```

### 2. Install the Dependencies 

```bash
npm install
```

### 3. Run the application  

```bash
node index.js
```

