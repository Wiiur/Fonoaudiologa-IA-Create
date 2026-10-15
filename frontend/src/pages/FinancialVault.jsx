import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, CheckCircle2, AlertTriangle, Building2, Smartphone } from 'lucide-react';
import api from '@/lib/api';

export default function FinancialVault() {
  const [loading, setLoading] = useState(false);
  const [savedData, setSavedData] = useState(null);
  const [editMode, setEditMode] = useState(false);
  
  // Estado do Formulário
  const [formData, setFormData] = useState({
    cpf_cnpj: '',
    pix_key: '',
    bank_code: '341', // Padrão Itaú
    agency: '',
    account: '',
    account_type: 'corrente'
  });

  const bancosPopulares = [
    { code: '341', name: 'Itaú Unibanco' },
    { code: '033', name: 'Santander' },
    { code: '237', name: 'Bradesco' },
    { code: '001', name: 'Banco do Brasil' },
    { code: '104', name: 'Caixa Econômica' },
    { code: '260', name: 'Nubank' },
    { code: '077', name: 'Banco Inter' },
  ];

  useEffect(() => {
    fetchVaultData();
  }, []);

  const fetchVaultData = async () => {
    try {
      const response = await api.get('/finance/vault');
      if (response.data.status === 'configured') {
        setSavedData(response.data);
      } else {
        setEditMode(true);
      }
    } catch (error) {
      console.error("Erro ao carregar cofre:", error);
      setEditMode(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/finance/vault', formData);
      setEditMode(false);
      fetchVaultData();
    } catch (error) {
      alert("Erro ao salvar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-sm border border-stone-200">
      
      {/* HEADER DE SEGURANÇA */}
      <div className="flex items-center gap-4 border-b border-stone-100 pb-4 mb-6">
        <div className="p-3 bg-green-50 text-green-700 rounded-full">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-stone-800">Cofre de Recebimentos</h2>
          <p className="text-sm text-stone-500">Configure onde você deseja receber os pagamentos dos pacientes.</p>
        </div>
      </div>

      {/* VISÃO PROTEGIDA (QUANDO JÁ ESTÁ CADASTRADO) */}
      {!editMode && savedData && (
        <div className="bg-stone-50 border border-stone-200 rounded-md p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-green-100 rounded-bl-full -mr-10 -mt-10 opacity-50"></div>
          
          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lock size={16} className="text-green-600" />
                <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Dados Protegidos ponta a ponta</span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <span className="block text-xs text-stone-500 uppercase">Chave PIX Principal</span>
                  <span className="text-lg font-mono text-stone-800">{savedData.pix_masked || "Não cadastrada"}</span>
                </div>
                
                <div className="pt-3 border-t border-stone-200/60">
                  <span className="block text-xs text-stone-500 uppercase">Conta para Transferência TED/PIX</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 size={16} className="text-stone-400" />
                    <span className="text-sm font-medium text-stone-700">Banco: {savedData.bank_code}</span>
                  </div>
                  <div className="flex gap-6 mt-1">
                    <span className="text-sm text-stone-600 font-mono">Ag: {savedData.agency}</span>
                    <span className="text-sm text-stone-600 font-mono">Cc: {savedData.account_masked}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => setEditMode(true)}
              className="px-4 py-2 bg-white border border-stone-300 text-stone-700 text-sm font-semibold rounded-md hover:bg-stone-50 transition-colors shadow-sm"
            >
              Alterar Conta
            </button>
          </div>
          
          <div className="mt-6 flex items-center gap-2 text-xs text-stone-400">
            <CheckCircle2 size={14} />
            Última atualização: {new Date(savedData.updated_at).toLocaleDateString('pt-BR')}
          </div>
        </div>
      )}

      {/* FORMULÁRIO DE EDIÇÃO */}
      {editMode && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-md text-sm flex items-start gap-3">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <p>Os pagamentos dos seus pacientes serão liquidados automaticamente para a conta informada abaixo. Certifique-se de que a conta pertence ao <strong>mesmo titular</strong> do CPF/CNPJ informado.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">CPF ou CNPJ do Titular</label>
              <input 
                required
                type="text" 
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="000.000.000-00"
                value={formData.cpf_cnpj}
                onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700 flex items-center gap-2"><Smartphone size={16}/> Chave PIX <span className="text-xs text-stone-400 font-normal">(Recomendado)</span></label>
              <input 
                type="text" 
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="E-mail, CPF, Celular ou Aleatória"
                value={formData.pix_key}
                onChange={e => setFormData({...formData, pix_key: e.target.value})}
              />
            </div>

            <div className="space-y-1 md:col-span-2 pt-4 border-t border-stone-100">
              <h3 className="text-sm font-bold text-stone-800 mb-4">Ou Dados Bancários Tradicionais</h3>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-stone-700">Banco</label>
              <select 
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-md outline-none"
                value={formData.bank_code}
                onChange={e => setFormData({...formData, bank_code: e.target.value})}
              >
                {bancosPopulares.map(b => (
                  <option key={b.code} value={b.code}>{`${b.code} - ${b.name}`}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">Agência (sem dígito)</label>
              <input 
                type="text" 
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-md outline-none"
                placeholder="Ex: 0001"
                value={formData.agency}
                onChange={e => setFormData({...formData, agency: e.target.value})}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">Conta com dígito</label>
              <input 
                type="text" 
                className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-md outline-none"
                placeholder="Ex: 12345-6"
                value={formData.account}
                onChange={e => setFormData({...formData, account: e.target.value})}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button 
              type="submit" 
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              {loading ? "Salvando com segurança..." : <><Lock size={16} /> Salvar no Cofre</>}
            </button>
            {savedData && (
              <button 
                type="button" 
                onClick={() => setEditMode(false)}
                className="px-6 py-2.5 bg-white border border-stone-300 text-stone-600 font-semibold rounded-md hover:bg-stone-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}