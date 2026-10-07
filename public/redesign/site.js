/* Compatibility entry for pages opened before the interaction lifecycle update. */
void import('/redesign/interactions.js?v=20260928-2').then(module => module.default()).catch(error => console.error('Page interactions could not initialize', error));
