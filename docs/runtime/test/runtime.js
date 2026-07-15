let load = false;
function capture(){
    const events = ['click']
    const callback = (ev)=>{
        const node =ev.composedPath().find(n=>n.dataset && 'id' in n.dataset) 
        if(node){
            const {id} = node.dataset
            console.log(Number(id))            
        }
    }
    events.forEach(ev=>document.addEventListener(ev,callback))
    return true;
}
requestIdleCallback(()=>{   
   !load && (load=capture());
})