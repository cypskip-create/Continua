declare module '@paystack/inline-js' {
 export default class Paystack { resumeTransaction(accessCode:string,callbacks:{onSuccess:(transaction:{reference:string})=>void;onCancel:()=>void;onError:(error:{message:string})=>void}):unknown; }
}
