const process = require('process');
const fs = require('fs');

var job;

async function main(){

  await require('dcp-client').init(process.argv);

  const compute = require('dcp/compute');
  const wallet = require('dcp/wallet');
  const dcpCli = require('dcp/dcp-cli');

  const argv = dcpCli.base([
    '\x1b[33mThis application is for testing.\x1b[37m'
  ].join('\n'))
    .options({
      numworker: {
        describe: 'number of workers',
        type: 'number',
        default: 1
      }
    })
    .argv;


  const numWorkers = argv.numworker;

  const identityKeystore = await dcpCli.getIdentityKeystore();
  wallet.addId(identityKeystore);

  const accountKeystore = await dcpCli.getAccountKeystore();

  console.log("Loaded Keystore");
  
  job = compute.for([...Array(numWorkers).keys()],async function(sim_id, iternum){
    progress();

    require('pyodide');
    try{
      await Module.isDoneLoading(progress);
    }catch(err){
      try{
        await pyodide.isDoneLoading(progress);
      }catch(er){
        while (typeof pyodide.isDoneLoading === 'undefined'){
          await new Promise((resolve, reject)=> setTimeout(resolve, Math.ceil(Math.random() * 1000)));
          progress();
        }
      }
    };
    progress();

    require('numpy');

    pyodide.runPython('import importlib as _importlib\n' +
                      '_importlib.invalidate_caches()\n');

    pyodide.runPython(`
import numpy as np

def random_gen(n):
  a = np.random.rand(n, 2)
  d = a[:,0]**2 + a[:,1]**2
  b = d<=1
  b = b.astype('int')
  return b.tolist()

out = random_gen(100)

`);
    console.log(pyodide.globals.out);
    progress();
    return "DONE" ;
  },[1]);

  console.log('Deploying Job!');

  job.on('accepted', ()=>{
    console.log('Job accepted....');
  });

  job.on('status', (status)=>{
    console.log('Got a status update: ', status);
  });
  job.on('result', (value) =>{ 
    console.log("result- ", value.result);
  });

  job.on('error', (err)=>{
    console.log(err);
  });

  job.on('console', (Output) => {
    console.log(Output.message);
  });

  job.on('uncaughException', (Output) =>{
    console.log(Output);
  });
  
  job.on('ENOFUNDS', (err)=>{
    console.log("ENOFUNDS: ", err);
  });

  job.on('ENOPROGRESS', (err)=>{
    console.log("ENOPROGRESS: ", err);
  });

  job.public.name = 'DCP-pyodide-Test';

  job.requires('aitf-numpy_1/numpy');
  job.requires('aitf-pyodide_5/pyodide');

  await job.localExec(1, compute.marketValue, accountKeystore);

  console.log("Done!");

};




main().then( ()=> process.exit(0)).catch(e=>{console.error(e);job.cancel();console.log("Cancelled Job.");process.exit(1)});
