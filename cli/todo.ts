import { main } from "./main";

process.exitCode = main(process.argv.slice(2), {
  out: (s) => console.log(s),
  err: (s) => console.error(s),
});
