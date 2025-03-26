#!/usr/bin/env node

const {Command} = require('commander');
const program = new Command();
const path = require('path');
const fs = require('fs');

const scanner = require('../lib/scanner');
const aiSuggestions = require('../lib/aiSuggestions');

program
    .name('axcel')
    .description('An AI-powered Web Accessibility Scanning tool which scans HTML and CSS files for accessibility issues and provides suggestions to improve accessibility.')
    .version('1.0.0');

program
    .command('scan')
    .description('Scan HTML and CSS files for accessibility issues')
    .argument('<input>', 'Path to the HTML/CSS file or directory')
    .option('-r, --report <type>', 'Specify report format (json, html)', 'json')
    .option('-a, --ai', 'Enable AI driven suggestions')
    .action(async (input, options) => {
        try {
            if (!fs.existsSync(input)) {
                console.error(`Error: The Specified path "${input}" does not exist.`);
                process.exit(1);
            }

            const stats = fs.statSync(input);
            let results = [];

            // Function that recursively walks through directories and scans files
            const walkDirectory = (dir) => {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const fullPath = path.join(dir, file);
                    const fileStats = fs.statSync(fullPath);
                    if (fileStats.isDirectory()) {
                        walkDirectory(fullPath);
                    } else if (['.html', '.css'].includes(path.extname(fullPath))) {
                        console.log(`Scanning file: ${fullPath}`);
                        const report = scanner.scan(fullPath);
                        results.push({file: fullPath, report});
                    }
                });
            };

            // Scan a single file or directory
            if (stats.isFile()) {
                console.log(`Scanning file: ${input}`);
                const report = scanner.scan(input);
                results.push({file: input, report});
            } else if (stats.isDirectory()) {
                console.log(`Scanning directory: ${input}`);
                walkDirectory(input);
            } else {
                console.error("Error: Input path is neither a file or directory.");
                process.exit(1);
            }

            // If AI suggestions are enabled, add them to the report
            if (options.ai) {
                console.log("Generating AI-driven suggestions...");
                for (let result of results) {
                    const suggestions = await aiSuggestions.processReport(result.report);
                    result.aiSuggestions = suggestions;
                }
            }

            // Output the results based on the chosen report format
            if (options.report === 'json') {
                console.log(JSON.stringify(results, null, 2));
            } else if (options.report === 'html') {
                const htmlOutput = `
                    <html>
                        <head>
                            <title>Accessibility Scan Report</title>
                        </head>
                        <body>
                            <pre>${JSON.stringify(results, null, 2)}</pre>
                        </body>
                    </html>
                `;
                console.log(htmlOutput);
            } else {
                console.error("Error: Unsupported report format. Please use 'json' or 'html'.");
                process.exit(1);
            }
        } catch (error) {
            console.error("An error occurred during scanning:", error);
            process.exit(1);
        }
    });

program.parse(process.argv);
