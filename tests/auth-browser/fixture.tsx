import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../src/App';
import '../../src/index.css';
import {reset,signal,server,deleteAccount} from './sdk';
import {TemporaryPasswordField} from '../../src/components/TemporaryPasswordField';
let clipboardAllowed=false;
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{if(value!=='Fixture-only-copy!')throw Error('Unexpected credential');if(!clipboardAllowed)throw Error('Clipboard denied');}}});
createRoot(document.getElementById('root')!).render(<><App/><aside><button onClick={reset}>Simulate admin reset</button><button onClick={signal}>Simulate untrusted hint</button><button onClick={deleteAccount}>Simulate account deletion</button><button onClick={()=>{server.rejectCompletion=true;}}>Reject completion</button><button onClick={()=>{clipboardAllowed=true;}}>Allow fixture clipboard</button><TemporaryPasswordField password="Fixture-only-copy!"/></aside></>);
