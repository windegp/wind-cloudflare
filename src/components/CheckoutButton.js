'use client'
import { useFormStatus } from 'react-dom';

export default function CheckoutButton() {
    const { pending } = useFormStatus();

    return (
        <button 
            type="submit" 
            disabled={pending}
            className={`w-full py-3 rounded-md text-white font-bold transition-all ${
                pending? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
        >
            {pending? 'جاري توجيهك للدفع...' : 'تأكيد ودفع بالبطاقة'}
        </button>
    );
}