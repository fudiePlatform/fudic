import {event } from './dom.js'

const cl = class extends HTMLElement { 
    #c
    h(props) {
        this.#c = cl.c([this.shadowRoot,...props])
        this.#c.h()
    }
    disconnectedCallback(){
        this.#c.r()
    }
    static c($props) {
        let $n1,$n2
        const $d=[]
        const [$shadow,$v1, $v2] = $props
        const click = (ev)=>console.log(ev)
        return {
            c: () => { },
            u: () => { },
            m: () => { },
            h: () => { 
                $n1=$shadow.children[0]
                $n2 = $shadow.children[1]
                $n2 && $d.push(event($n2,'click',click))
            },
            r: () => { 
                $n1=null                
                $n2 = null
                $shadow=null
                $d.forEach(d=>d())
            }
        }
    }
}
customElements.define("app-badge",cl)
