// One visible identity. Case differences do not create a second handle.
export const HANDLE_MAX = 16;
export function cleanHandle(value) {
 return String(value ?? '').replace(/[^A-Za-z0-9 _\-.']/g, '').replace(/\s{2,}/g, ' ').slice(0,HANDLE_MAX).trim();
}
export const handleKey = value => cleanHandle(value).toLowerCase();
export function validHandle(value) {
 return typeof value==='string' && value===cleanHandle(value) && value.length>0 && !/^bot-/i.test(value);
}
