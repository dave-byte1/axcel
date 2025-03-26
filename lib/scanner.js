// Dummy report for CLI testing purposes
module.exports.scan = function (filePath) {
    return {
        issues: [`Issue detected in ${filePath}`],
        passed: false,
    };
};