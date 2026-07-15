const cl = class extends HTMLElement {
    #c
    h(anchor, props) {
        this.#c = cl.c(anchor, props)
    }
    static c(anchor, props) {
        const [a, b] = props
        return {
            c: () => { },
            u: () => { },
            m: () => { },
            h: () => { },
            r: () => { }
        }
    }
}
customElements.define("app-counter",cl)
