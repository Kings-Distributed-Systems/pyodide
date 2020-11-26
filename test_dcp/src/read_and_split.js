fs = require('fs');


let data = fs.readFileSync('./pyodide.asm.data.js').toString();

let split_size = 10000000;

let filename = './pyodide.asm.data.part_';

let num_splits = Math.ceil(data.length / split_size);


for (let i = 0 ; i < num_splits; i++){
  let data_split = data.slice((i*split_size), (i+1)*split_size);
 
  let code = 
`
exports.code = \`${data_split}\`;\n
`;
  fs.writeFileSync(filename + (i+1).toString() + '.js', code);
};
