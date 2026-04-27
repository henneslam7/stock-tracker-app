import yf from 'yahoo-finance2'; console.log('methods:', Object.keys(yf)); try { console.log(yf.quote) } catch(e){} 
