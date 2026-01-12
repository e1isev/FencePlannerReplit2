const [major] = process.versions.node.split('.').map(Number);

const supportedMajors = new Set([20, 22]);

if (!supportedMajors.has(major)) {
  console.error(
    `Unsupported Node version ${process.versions.node}. Use Node 22 LTS (preferred) or Node 20 LTS. See README for instructions.`
  );
  process.exit(1);
}
