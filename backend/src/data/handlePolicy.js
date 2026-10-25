// Pure shared policy: safe for the frontend to import; no server dependencies.
export const HANDLE_MIN=4,HANDLE_MAX=15;
export const RESERVED_HANDLES=['support','official','system','moderator','root','api','auth','settings','login','signup','terms','privacy','help'];
export function normalizeUserHandle(value){return typeof value==='string'?value.trim().replace(/^@/,'').toLowerCase():'';}
export function handleError(value){
 if(typeof value!=='string'||!/^\w{4,15}$/.test(value)||!/[a-z0-9]/.test(value))return 'Use 4–15 letters, numbers or underscores, including a letter or number.';
 if(value!==value.toLowerCase())return 'Handles must use lowercase letters.';
 if(/admin|continua/.test(value)||RESERVED_HANDLES.includes(value))return 'This handle is reserved. Choose another handle.';
 return null;
}
