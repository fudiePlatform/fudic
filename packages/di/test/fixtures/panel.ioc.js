export const registered = [];

export const register = (container) => {
  registered.push(container.label);
};
