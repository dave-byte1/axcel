# AXCEL

An AI-powered Web Accessibility Scanning tool for HTML and CSS files.

## Installation

To install axcel globally, run the following command:
```bash
  npm install -g axcel
```
To install axcel locally, run the following command:
```bash
  npm install axcel
```

## Usage

To scan a single HTML, CSS file or a whole directory, run the following command:
```bash
  axcel scan path/to/file.html
```
```bash
  axcel scan path/to/directory
```

Scan with AI suggestions:
```bash
   axcel scan path/to/file.html --ai
```

Generate a HTML or JSON report:
```bash
   axcel scan path/to/directory --ai --report html --output report1.html
```
```bash
   axcel scan path/to/directory --ai --report json --output report2.json
```

