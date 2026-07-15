export function event(node,event,cb){
    node.addEventListener(event,cb)
    return ()=>node.removeEventListener(event,cb)
}