const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');
const axe = require('axe-core');
const postcss = require('postcss');

// Calculates the contrast ratio between two colors.
async function calculateContrastRatio(foreground, background) {
    let Color;
    try {
        Color = (await import('color')).default;
    } catch (error) {
        return null;
    }
    let fgColor, bgColor;
    try {
        fgColor = Color(foreground);
        bgColor = Color(background);
    } catch (error) {
        return null;
    }
    const L1 = Math.max(fgColor.luminosity(), bgColor.luminosity());
    const L2 = Math.min(fgColor.luminosity(), bgColor.luminosity());
    return (L1 + 0.05) / (L2 + 0.05);
}

// Main scanning function, determines file type and calls the appropriate function.
async function scan(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') {
        return await scanHTML(filePath);
    } else if (ext === '.css') {
        return await scanCSS(filePath);
    } else {
        return {error: 'Unsupported file type', file: filePath};
    }
}

// Scans an HTML file for accessibility issues using axe-core.
async function scanHTML(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const dom = new JSDOM(content);
    const {window} = dom;

    global.window = window;
    global.document = window.document;
    global.Node = window.Node;
    global.HTMLElement = window.HTMLElement;
    global.navigator = {userAgent: 'node.js'};

    return new Promise((resolve, reject) => {
        // Timeout configuration
        const axeConfig = {
            preload: {
                timeout: 10000,
                assets: ['cssom']
            },
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'best-practice']
            }
        };

        axe.run(window.document.documentElement, axeConfig, (err, results) => {
            if (err) {
                console.error("Error running axe-core:", err);
                return resolve({
                    file: filePath,
                    type: 'html',
                    issues: [],
                    error: err.message
                });
            }

            // Filter out unnecessary violations
            results.violations = results.violations.filter(rule => Array.isArray(rule.nodes) && rule.nodes.length > 0);
            results.incomplete = results.incomplete.filter(rule => Array.isArray(rule.nodes) && rule.nodes.length > 0);
            results.inapplicable = results.inapplicable.filter(rule => Array.isArray(rule.nodes) && rule.nodes.length > 0);

            resolve({
                file: filePath,
                type: 'html',
                issues: results.violations,
                passes: results.passes,
                incomplete: results.incomplete,
                inapplicable: results.inapplicable
            });
        });
    });
}

//Scans a CSS file for accessibility issues using PostCSS.
async function scanCSS(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let issues = [];

    const root = postcss.parse(content);

    // Walk through each rule node.
    for (const node of root.nodes) {
        if (node.type === 'rule') {
            let ruleIssues = [];
            let declarations = {};

            // Collect all declarations for the rule.
            node.walkDecls(decl => {
                declarations[decl.prop] = decl.value;
                // Flag the removal of focus styles.
                if (decl.prop === 'outline' && decl.value.includes('none')) {
                    ruleIssues.push({
                        type: 'FocusStyle',
                        message: `Rule "${node.selector}" uses "outline: none". Provide an alternative focus style.`,
                        declaration: `${decl.prop}: ${decl.value}`
                    });
                }
            });

            // Check the contrast ratio if both "color" and "background-color" are set.
            if (declarations['color'] && declarations['background-color']) {
                const ratio = await calculateContrastRatio(declarations['color'], declarations['background-color']);
                if (ratio !== null && ratio < 4.5) {
                    ruleIssues.push({
                        type: 'ColorContrast',
                        message: `Rule "${node.selector}" has insufficient color contrast: ratio ${ratio.toFixed(2)} (minimum 4.5 required).`,
                        declarations: {
                            color: declarations['color'],
                            'background-color': declarations['background-color']
                        }
                    });
                }
            }
            if (ruleIssues.length > 0) {
                issues.push({
                    selector: node.selector,
                    issues: ruleIssues
                });
            }
        }
    }

    return {
        file: filePath,
        type: 'css',
        issues: issues
    };
}

module.exports = {
    scan
};

if (require.main === module) {
    const fileToScan = process.argv[2];
    if (!fileToScan) {
        console.error('Please provide a file path to scan.');
        process.exit(1);
    }
    scan(fileToScan)
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}
