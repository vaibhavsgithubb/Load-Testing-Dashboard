# 📊 Load Test Dashboard

A professional, interactive web dashboard for visualizing and analyzing load test results. Import Excel reports, track performance over time, detect regressions, and generate executive summaries with beautiful charts and data tables.

![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.0.3-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## ✨ Features

### 📈 **Overview Page**
- **Executive Summary** with GREEN/AMBER/RED status indicators
- **SLA Violation Tracking** with configurable thresholds (avg/max response times)
- **Regression Detection** against baseline runs
- **Top Risks** identification and visualization
- **KPIs Dashboard** showing endpoints, loads, and overall performance
- **Interactive Charts** for load vs latency trends

### 🎛️ **Dashboard Page**
- **Customizable Grid Layout** with drag-and-drop widgets (saves to browser)
- **Dynamic Filtering** by run, user load, and endpoint
- **Multiple Visualizations**: Average response time charts, max response time charts, detailed results table
- **Widget Maximization** for focused analysis
- **Export-Ready Data Tables** with search, sort, and pagination

### ⚖️ **Compare Page**
- **Side-by-Side Comparison** of up to 4 runs
- **Delta Calculations** showing performance changes vs baseline
- **Visual Bar Charts** for quick comparison
- **Detailed Comparison Tables** with all metrics
- **Regression Highlighting** to quickly identify performance degradation

### 🔧 **Run Management**
- Set/unset baseline runs
- Exclude/include runs from analysis
- Delete old runs with confirmation
- View run metadata (release, environment, commit SHA, test type)
- Track source files and custom notes

---

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- pip package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd load-dashboard
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Verify installation**
   ```bash
   python --version  # Should be 3.8+
   ```

---

## 📥 Importing Load Test Results

### Excel File Format

Your Excel file should contain the following columns (headers are flexible):

| Column | Aliases | Description |
|--------|---------|-------------|
| `users_load` | Users Load, User Load, Users, Load | Number of concurrent users |
| `endpoint_name` | Endpoint Name, Endpoint, Name | API endpoint path |
| `avg_ms` | Average Response, Avg, Avg MS, Average | Average response time (milliseconds) |
| `min_ms` | Min, Minimum | Minimum response time (milliseconds) |
| `max_ms` | Max, Maximum | Maximum response time (milliseconds) |

**Example Excel data:**
```
Users Load | Endpoint Name      | Average Response | Min  | Max
-----------|-------------------|------------------|------|------
50         | /api/users        | 245              | 120  | 890
100        | /api/users        | 380              | 145  | 1250
50         | /api/products     | 156              | 89   | 450
```

### Basic Import

```bash
python import_results.py \
  --file data/results.xlsx \
  --run-name "2026-01-30_Nightly"
```

### Import with Full Metadata

```bash
python import_results.py \
  --file data/results.xlsx \
  --run-name "Sprint_23_LoadTest" \
  --baseline \
  --release "R2-2026.01" \
  --env "Performance" \
  --commit "abc123def" \
  --test-type "Load" \
  --sla-avg-ms 500 \
  --sla-max-ms 2000 \
  --regression-pct 15 \
  --notes "Full regression test before production deployment"
```

### Import Options

| Option | Description | Example |
|--------|-------------|---------|
| `--file` | Path to Excel file (required) | `data/results.xlsx` |
| `--run-name` | Unique name for this run (required) | `"2026-01-30_Release"` |
| `--sheet` | Excel sheet name (optional, uses first sheet by default) | `"Results"` |
| `--baseline` | Mark this run as the baseline (clears previous baseline) | - |
| `--release` | Release version | `"R1-2026.01"` |
| `--env` | Environment name | `"QA"`, `"Perf"`, `"Stage"` |
| `--commit` | Git commit SHA | `"a1b2c3d"` |
| `--test-type` | Type of load test | `"Load"`, `"Stress"`, `"Soak"`, `"Spike"` |
| `--sla-avg-ms` | SLA threshold for average response time (ms) | `500` |
| `--sla-max-ms` | SLA threshold for max response time (ms) | `2000` |
| `--regression-pct` | Regression threshold percentage | `15` (means 15% slower = regression) |
| `--notes` | Optional notes about the run | `"Pre-release test"` |
| `--db` | Path to SQLite database (optional, default: `runs.db`) | `custom.db` |

---

## 🌐 Running the Dashboard

### Start the Server

```bash
python app.py
```

The dashboard will be available at:
- **Overview**: http://localhost:8000/overview
- **Dashboard**: http://localhost:8000/dashboard
- **Compare**: http://localhost:8000/compare

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOAD_DASHBOARD_DB` | `runs.db` | Path to SQLite database |
| `PORT` | `8000` | Server port |

**Example:**
```bash
export LOAD_DASHBOARD_DB=production.db
export PORT=5000
python app.py
```

---

## 📖 Usage Guide

### Setting a Baseline

Baselines are used to detect performance regressions. To set a baseline:

1. Navigate to the **Overview** page
2. Select the run you want to use as baseline from the dropdown
3. Click **⭐ Set as baseline**

Only one run can be marked as baseline at a time. Setting a new baseline automatically unsets the previous one.

### Understanding SLA Violations

SLA violations are calculated based on thresholds you set during import:

- **Avg SLA**: Any endpoint/load combination with average response time > `sla-avg-ms`
- **Max SLA**: Any endpoint/load combination with max response time > `sla-max-ms`

The system counts violations and adjusts the status badge:
- 🟢 **GREEN**: No violations, no regressions
- 🟡 **AMBER**: 1-10 violations or regressions detected
- 🔴 **RED**: More than 10 violations or regressions

### Detecting Regressions

Regressions are calculated when:
1. A baseline is set
2. The current run has a `regression-pct` threshold
3. An endpoint/load combination is slower than baseline by more than the threshold

**Formula:**
```
pct_change = ((current_avg - baseline_avg) / baseline_avg) * 100
if pct_change >= regression_pct: FLAG AS REGRESSION
```

### Excluding Runs

You can exclude runs from analysis (e.g., failed tests, outliers):

1. Select the run in **Overview**
2. Click **🚫 Exclude**

Excluded runs won't appear in comparisons by default (use "Show excluded" checkbox to view them).

### Customizing Dashboard Layout

On the **Dashboard** page:
1. Filter your data (run, load, endpoint)
2. Click **Apply** to load data
3. Toggle options: Legend, Animations, Axis titles
4. Click **Save layout** to persist your preferences (stored in browser localStorage)
5. Click **Reset layout** to restore default layout

---

## 🗂️ Project Structure

```
load-dashboard/
├── app.py                      # Flask web server + API endpoints
├── import_results.py           # Excel import script
├── schema.sql                  # Database schema definition
├── requirements.txt            # Python dependencies
├── runs.db                     # SQLite database (created automatically)
├── README.md                   # This file
├── dashboard/
│   ├── templates/
│   │   ├── overview.html      # Overview page template
│   │   ├── dashboard.html     # Dashboard page template
│   │   └── compare.html       # Compare page template
│   └── static/
│       ├── css/
│       │   └── style.css      # Global styles (dark glassmorphic theme)
│       └── js/
│           ├── common.js      # Shared Chart.js defaults
│           ├── overview.js    # Overview page logic
│           ├── dashboard.js   # Dashboard page logic
│           └── compare.js     # Compare page logic
└── data/
    └── (your Excel files)     # Store your test results here
```

---

## 🛠️ API Reference

### Get All Runs
```http
GET /api/runs
```
Returns list of all runs with metadata.

### Get Run Summary
```http
GET /api/run/<run_id>/summary
```
Returns KPIs, slowest endpoints, and metadata for a specific run.

### Get Run Data
```http
GET /api/run/<run_id>/data?load=<load>&endpoint=<endpoint>
```
Returns measurements for a run. Optional filters: `load` (integer), `endpoint` (string).

### Get Executive Summary
```http
GET /api/run/<run_id>/exec_summary
```
Returns status, SLA violations, regressions, and top risks.

### Set Baseline
```http
POST /api/runs/<run_id>/set_baseline
```
Marks the specified run as baseline (unsets previous baseline).

### Exclude/Include Run
```http
POST /api/runs/<run_id>/exclude
POST /api/runs/<run_id>/include
```
Toggles the excluded status of a run.

### Delete Run
```http
DELETE /api/runs/<run_id>
POST /api/runs/<run_id>/delete
```
Permanently deletes a run (cannot delete baseline runs).

### Compare Runs
```http
POST /api/compare
Content-Type: application/json

{
  "run_ids": [1, 2, 3, 4],
  "load": 50,              // optional
  "endpoint": "/api/users" // optional
}
```
Returns side-by-side comparison of multiple runs.

---

## 🎨 Tech Stack

- **Backend**: Flask 3.0.3, SQLite3
- **Data Processing**: Pandas 2.2.2, openpyxl 3.1.5, python-dateutil 2.9.0
- **Frontend**: Vanilla JavaScript (ES6+)
- **Charts**: Chart.js 4.4.3
- **Tables**: DataTables 2.1.8
- **Grid Layout**: GridStack 10.3.0
- **Styling**: Custom CSS with glassmorphic dark theme

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs**: Open an issue with reproduction steps
2. **Suggest Features**: Describe your use case and proposed solution
3. **Submit Pull Requests**: Fork the repo, create a feature branch, and submit a PR

### Development Setup

```bash
# Clone and setup
git clone <repository-url>
cd load-dashboard
pip install -r requirements.txt

# Run in debug mode
python app.py
# Server will auto-reload on code changes (Flask debug mode)
```

---

## 📝 Tips & Best Practices

1. **Naming Conventions**: Use consistent run names like `YYYY-MM-DD_Environment_Type` (e.g., `2026-01-30_Perf_Load`)

2. **Regular Baselines**: Update your baseline after each major release to track progressive performance

3. **Metadata Matters**: Always include release, environment, and commit SHA for traceability

4. **SLA Thresholds**: Set realistic thresholds based on your service-level agreements (e.g., P95 < 500ms)

5. **Regression Threshold**: 10-15% is a common starting point; adjust based on your application's stability

6. **Data Cleanup**: Periodically delete old/irrelevant runs to keep the dashboard fast

7. **Excel Template**: Keep a standard Excel template with correct column headers for your team

---

## 🐛 Troubleshooting

### Import fails with "Missing required columns"
- Check your Excel headers match expected format (case-insensitive)
- Verify all required columns are present: users_load, endpoint_name, avg_ms, min_ms, max_ms

### Charts not rendering
- Clear browser cache and reload
- Check browser console for JavaScript errors
- Ensure CDN resources (Chart.js, DataTables) are accessible

### Cannot delete baseline run
- First unset the baseline by setting a different run as baseline
- Or click **Set as baseline** on another run first

### Database locked error
- Close any other processes accessing `runs.db`
- On Windows, check for file handles with Process Explorer

---

## 📜 License

MIT License - feel free to use this project for your team's load testing needs!

---

## 🙋 Support

For questions, issues, or feature requests:
- Open an issue in this repository
- Contact the development team
- Check the API documentation above

---

**Made with ❤️ for better load testing workflows**
