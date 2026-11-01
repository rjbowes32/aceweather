// Fails fast with a clear message when Node is too old to run the .ts tests
// (type stripping needs Node 22, as CI uses).
const need = Number(process.argv[2] || 22);
const have = Number(process.versions.node.split(".")[0]);
if (have < need) {
  console.error(`Tests need Node ${need}+ (found ${process.versions.node}). Try: npx -y node@${need} --run test`);
  process.exit(1);
}
