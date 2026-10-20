export function pushOwner(){try{return localStorage.getItem('fpiupdates.push.owner');}catch{return null;}}
export function savePushOwner(id:string|null){try{if(id)localStorage.setItem('fpiupdates.push.owner',id);else localStorage.removeItem('fpiupdates.push.owner');}catch{}}
