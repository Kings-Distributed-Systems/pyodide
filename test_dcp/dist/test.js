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

    require('pyodide_5');
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
        await pyodide.isDoneLoading(progress);
      }
    };
    pyprogress = ()=>{console.log("PROGRESS INSIDE PYTHON");progress();};
    await pyodide.runPythonAsync(`
from scipy import signal
from scipy.optimize import minimize, OptimizeResult
from autograd import grad
from autograd import value_and_grad
from autograd import numpy as np
import nltk
from sklearn.naive_bayes import GaussianNB
from js import pyprogress
from builtins import range

pyprogress()
print(range)

print('nltk: ',nltk)
print('autograd.grad: ', grad)
print('numpy autograd wrapped: ', np)
print('scipy.signal : ', signal)
print('sklearn.naive_bayes.GaussianNB: ', GaussianNB)



print(np.ones([10,10]).shape)
`);

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


//  job.requirements.environment.offscreenCanvas = false;

  job.requires('aitf-pyodide_dev/pyodide_5');
  job.requires('aitf-numpy_5/numpy');
  job.requires('aitf-scipy_6/scipy');
  job.requires('aitf-autograd_2/autograd');
  job.requires('aitf-future_2/future');
  job.requires('aitf-regex_1/regex');
  job.requires('aitf-nltk_1/nltk');
  job.requires('aitf-scikit-learn_1/scikit-learn');
  job.requires('aitf-joblib_1/joblib');
  await job.exec( compute.marketValue, accountKeystore);

  console.log("Done!");

};




main().then( ()=> process.exit(0)).catch(e=>{console.error(e);job.cancel();console.log("Cancelled Job.");process.exit(1)});
