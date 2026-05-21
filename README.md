# Katalon API Script Generator

A web application to convert cURL commands and API responses into Katalon Studio Groovy automation scripts.

## Features

- **Single cURL Mode**: Convert individual cURL commands to Katalon scripts
- **Bulk TXT Upload**: Process multiple TXT files (cURL + JSON response) at once
- **ZIP File Upload**: Upload a ZIP file containing multiple TXT files
- **TestCase Mapper**: Map TestCaseKey values from Excel files
- **Auto-extract Expected Status**: Automatically extract HTTP status codes from response files

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **JSZip** - ZIP file handling
- **xlsx** - Excel file parsing

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/maulanahabibie012/generateapi.git
cd generateapi
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
# or
yarn build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
# or
yarn preview
```

## Usage

### Single cURL Mode

1. Enter your cURL command in the input field
2. Enter a sample API response (JSON format)
3. Configure Test Case ID, Test Case Key, and other settings
4. Click "Generate Script" to create the Katalon script

### Bulk TXT Upload

1. Prepare TXT files with the format:
```
CURL
====
curl -X GET 'https://api.example.com/endpoint' \
  -H 'Content-Type: application/json'

RESPONSE
====
{
  "meta": {
    "status_code": "00000",
    "status_desc": "Success"
  }
}
```

2. Upload one or multiple TXT files
3. Each file generates one TC function
4. Function calls are placed at the top of the output

### TestCase Mapper

1. Input TCID format: `TCID(dependency, DGCR-TXXXXX, TestCycleKey)`
2. Upload Excel file with columns:
   - `Test Case.Test Case ID`
   - `Test Case.Key`
3. The mapper replaces DGCR-TXXXXX with values from the Excel file

## Project Structure

```
katalon-api-generator/
├── src/
│   ├── components/
│   │   ├── BulkUpload.jsx
│   │   └── TestCaseMapper.jsx
│   ├── utils/
│   │   ├── curlParser.js
│   │   ├── responseParser.js
│   │   ├── katalonGenerator.js
│   │   ├── txtParser.js
│   │   └── curlCleaner.js
│   ├── App.jsx
│   └── main.jsx
├── public/
├── package.json
└── vite.config.js
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project to Vercel
3. Deploy with default settings

### Netlify

1. Push your code to GitHub
2. Connect repository in Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`

### GitHub Pages

```bash
npm run deploy
```

## License

MIT License

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
