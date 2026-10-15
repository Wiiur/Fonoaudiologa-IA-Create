import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QrCode, Copy, CheckCircle2, MessageCircle, Receipt, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export default function PixBillingModal({ isOpen, onOpenChange, patientId, patientName, patientPhone }) {
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState(null);
  const [copied, setCopied] = useState(false);
  
  // Estado do formulário de cobrança
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('Sessão Fonoaudiológica');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]); // Data de hoje por padrão

  // Limpa o estado sempre que o modal for fechado
  const handleOpenChange = (open) => {
    if (!open) {
      setTimeout(() => {
        setPixData(null);
        setAmount('');
        setCopied(false);
      }, 300);
    }
    onOpenChange(open);
  };

  const handleGeneratePix = async (e) => {
    e.preventDefault();
    
    // Tratamento de vírgula para ponto (ex: 150,00 -> 150.00)
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return toast.error("Por favor, insira um valor válido.");
    }

    setLoading(true);
    try {
      const response = await api.post('/finance/pix/generate', {
        patient_id: patientId,
        amount: numericAmount,
        description: description,
        due_date: dueDate
      });

      if (response.data.status === 'success') {
        setPixData(response.data);
        toast.success("Cobrança Pix gerada com sucesso!");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao gerar Pix. Verifique se o seu Cofre está configurado.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = () => {
    if (pixData?.payload) {
      navigator.clipboard.writeText(pixData.payload);
      setCopied(true);
      toast.success("Código Copia e Cola copiado!");
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleWhatsAppShare = () => {
    if (!pixData?.payload) return;
    
    const text = `Olá! Segue o código Pix (Copia e Cola) referente a: *${description}* no valor de *R$ ${amount}*.\n\nCódigo Pix:\n${pixData.payload}\n\nAgradecemos a confiança!`;
    const encodedText = encodeURIComponent(text);
    
    // Abre o WhatsApp da própria clínica para enviar a mensagem diretamente
    const phoneClean = patientPhone ? patientPhone.replace(/\D/g, '') : '';
    const url = phoneClean 
      ? `https://wa.me/55${phoneClean}?text=${encodedText}` 
      : `https://wa.me/?text=${encodedText}`;
      
    window.open(url, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-stone-50 rounded-2xl border-stone-200 p-0 overflow-hidden">
        <DialogHeader className="bg-white p-6 border-b border-stone-200">
          <DialogTitle className="font-heading text-xl text-stone-800 flex items-center gap-2">
            <QrCode className="text-emerald-600" size={22} />
            Gerar Cobrança Pix
          </DialogTitle>
        </DialogHeader>

        <div className="p-6">
          {!pixData ? (
            /* PASSO 1: FORMULÁRIO DE GERAÇÃO */
            <form onSubmit={handleGeneratePix} className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg mb-4">
                <p className="text-xs text-emerald-800 flex items-center gap-2">
                  <Receipt size={14} />
                  Cobrança para: <strong>{patientName || "Paciente"}</strong>
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Valor (R$)</Label>
                <Input 
                  required
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 150.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 bg-white text-lg font-mono"
                  autoFocus
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Descrição da Cobrança</Label>
                <Input 
                  required
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-11 bg-white"
                  placeholder="Ex: Sessão Fonoaudiológica"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Vencimento</Label>
                <Input 
                  required
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-11 bg-white"
                />
              </div>

              <Button 
                type="submit" 
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-xl mt-4 shadow-md transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin mr-2" /> : <QrCode size={18} className="mr-2" />}
                {loading ? "Processando no Banco..." : "Gerar QR Code Pix"}
              </Button>
            </form>
          ) : (
            /* PASSO 2: EXIBIÇÃO DO QR CODE E COMPARTILHAMENTO */
            <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
              <h3 className="text-lg font-bold text-stone-800 mb-1">R$ {amount}</h3>
              <p className="text-xs text-stone-500 mb-6">{description}</p>

              {/* QR Code gerado pelo Asaas em Base64 */}
              <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-sm mb-6">
                <img 
                  src={`data:image/jpeg;base64,${pixData.encoded_image}`} 
                  alt="QR Code Pix" 
                  className="w-48 h-48 object-contain"
                />
              </div>

              <div className="w-full space-y-3">
                <Button 
                  onClick={handleCopyPix}
                  variant="outline"
                  className={`w-full h-11 font-bold ${copied ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-50' : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'}`}
                >
                  {copied ? <CheckCircle2 size={18} className="mr-2" /> : <Copy size={18} className="mr-2" />}
                  {copied ? "Código Copiado!" : "Copiar Pix Copia e Cola"}
                </Button>

                <Button 
                  onClick={handleWhatsAppShare}
                  className="w-full bg-[#25D366] hover:bg-[#1ebd5a] text-white font-bold h-11 shadow-sm"
                >
                  <MessageCircle size={18} className="mr-2" />
                  Enviar via WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}