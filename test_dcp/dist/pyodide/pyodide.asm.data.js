//This module was created by a dcpify script from AITF

module.declare([], function(require, exports, module) {

  let num_to_read = 7;
  let toRun = '';
  for (let i = 0; i < num_to_read; i++){
    let filename = 'pyodide.asm.data.part_' + (i+1).toString();
    let { code } = require(filename);
    toRun += code;
  };
  eval(toRun);

});// this concludes the module definition
