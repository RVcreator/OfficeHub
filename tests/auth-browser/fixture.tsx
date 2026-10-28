import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../src/App';
import '../../src/index.css';
import {reset,signal,server} from './sdk';
createRoot(document.getElementById('root')!).render(<><App/><aside><button onClick={reset}>Simulate admin reset</button><button onClick={signal}>Simulate untrusted hint</button><button onClick={()=>{server.rejectCompletion=true;}}>Reject completion</button></aside></>);
