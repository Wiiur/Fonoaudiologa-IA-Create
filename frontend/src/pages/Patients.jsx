import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, User, Phone, Calendar, MessageSquare, 
  Filter, MoreVertical, CheckCircle, XCircle, FileText, UserCheck, ShieldAlert, X
} from 'lucide-react';
import { API as api } from '../lib/api'; // Ajuste o caminho da API conforme seu projeto

import { useNavigate } from 'react-router-dom'; // Para navegação entre páginas

export default function Patients({ onSelectPatient }) {
  const navigate = useNavigate(); // Hook para navegação programática
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros de busca
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'all', 'active', 'inactive'
  const [ageGroupFilter, setAgeGroupFilter] = useState('all'); // 'all', 'child', 'teen', 'adult', 'senior'
  
  // Modal de Cadastro
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State Inicial
  const initialForm = {
    photo_url: '',
    name: '',
    birth_date: '',
    rg_cpf: '',
    biological_sex: 'feminino',
    gender_identity: 'Cisgênero',
    email: '',
    phone: '',
    address: '',
    has_responsible: false,
    responsible: { name: '', relationship: '', cpf: '' },
    profession_vocal_demand: '',
    chief_complaint: '',
    otorrhoea_diagnosis: '',
    interests: '',
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);

  // Preview de Foto e Base64
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);

  // Carrega Pacientes
  const fetchPatients = async () => {
    setLoading(true);
    try {
      const res = await api.get('/patients');
      setPatients(res.data || []);
    } catch (err) {
      console.error("Erro ao carregar pacientes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  // Cálculo de Idade Automático
  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  // Alternar Status do Paciente (Ativar/Desativar)
  const handleToggleStatus = async (patient, e) => {
    e.stopPropagation();
    const newStatus = patient.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/patients/${patient.patient_id}`, { status: newStatus });
      setPatients(prev => prev.map(p => p.patient_id === patient.patient_id ? { ...p, status: newStatus } : p));
    } catch (err) {
      alert("Erro ao alterar status do paciente.");
    }
  };

  // Submeter Novo Cadastro
  const handleCreatePatient = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert("O Nome Completo é obrigatório.");
    
    setIsSubmitting(true);
    try {
      const calculatedAge = calculateAge(formData.birth_date);
      const payload = {
        ...formData,
        age: calculatedAge,
        photo_url: photoBase64
      };
      
      await api.post('/patients', payload);
      setIsModalOpen(false);
      setFormData(initialForm);
      fetchPatients();
    } catch (err) {
      console.error(err);
      alert("Erro ao cadastrar paciente.");
    } finally {
      setIsSubmitting(false);
    }
  };

// Função para lidar com upload de foto
  const handlePhotoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result); // Mostra a bolinha na tela
        setPhotoBase64(reader.result);  // Guarda para enviar pro Python
      };
      reader.readAsDataURL(file);
    }
  };

  // Lógica de Filtro dos Cards
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      // 1. Filtro de Texto (Nome, Queixa ou CPF)
      const matchesSearch = 
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.chief_complaint?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.rg_cpf?.includes(searchTerm);

      // 2. Filtro de Status
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

      // 3. Filtro de Faixa Etária
      const age = p.age ?? calculateAge(p.birth_date);
      let matchesAgeGroup = true;
      if (ageGroupFilter === 'child') matchesAgeGroup = age !== null && age <= 12;
      else if (ageGroupFilter === 'teen') matchesAgeGroup = age !== null && age >= 13 && age <= 17;
      else if (ageGroupFilter === 'adult') matchesAgeGroup = age !== null && age >= 18 && age <= 59;
      else if (ageGroupFilter === 'senior') matchesAgeGroup = age !== null && age >= 60;

      return matchesSearch && matchesStatus && matchesAgeGroup;
    });
  }, [patients, searchTerm, statusFilter, ageGroupFilter]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      
      {/* HEADER DA PÁGINA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 tracking-tight">Gestão de Pacientes</h1>
          <p className="text-sm text-stone-500 mt-1">
            {filteredPatients.length} paciente(s) localizado(s)
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md transition-all cursor-pointer"
        >
          <Plus size={18} /> Novo Paciente
        </button>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        
        {/* Pesquisa por Texto */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, queixa ou CPF..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Filtros Dropdown */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-stone-50 border border-stone-200 text-stone-700 text-sm rounded-xl px-3 py-2 outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Somente Ativos</option>
            <option value="inactive">Somente Inativos</option>
          </select>

          {/* Faixa Etária */}
          <select
            value={ageGroupFilter}
            onChange={e => setAgeGroupFilter(e.target.value)}
            className="bg-stone-50 border border-stone-200 text-stone-700 text-sm rounded-xl px-3 py-2 outline-none focus:border-amber-500"
          >
            <option value="all">Todas as Idades</option>
            <option value="child">Infantil (0 - 12 anos)</option>
            <option value="teen">Adolescente (13 - 17 anos)</option>
            <option value="adult">Adulto (18 - 59 anos)</option>
            <option value="senior">Idoso (60+ anos)</option>
          </select>

        </div>
      </div>

      {/* GALERIA EM GRID (4 COLUNAS) */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 animate-pulse font-medium">
          Carregando lista de pacientes...
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">
          <User size={40} className="mx-auto mb-3 text-stone-300" />
          <p className="font-semibold text-lg">Nenhum paciente encontrado</p>
          <p className="text-sm text-stone-400 mt-1">Tente ajustar os filtros ou busque por outro termo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredPatients.map(patient => {
            const age = patient.age ?? calculateAge(patient.birth_date);
            const isActive = patient.status === 'active';
            
            // Link limpo do WhatsApp
            const cleanPhone = patient.phone?.replace(/\D/g, '');
            const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

            return (
              <div
                key={patient.patient_id}
                  onClick={() => navigate(`/patients/${patient.patient_id}`)}
                className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-lg cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                  isActive 
                    ? 'border-stone-200 hover:border-amber-500/50' 
                    : 'border-stone-200 bg-stone-50/60 opacity-75'
                }`}
              >
                {/* TOPO DO CARD */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    
                    {/* Foto Circular */}
                    <div className="relative shrink-0">
                      {patient.photo_url ? (
                        <img 
                          src={patient.photo_url} 
                          alt={patient.name} 
                          className="w-12 h-12 rounded-full object-cover border border-stone-200 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg border border-amber-200/60 shadow-sm">
                          {patient.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      {/* Ponto de Status */}
                      <span 
                        className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          isActive ? 'bg-emerald-500' : 'bg-rose-500'
                        }`} 
                        title={isActive ? "Paciente Ativo" : "Paciente Inativo"}
                      />
                    </div>

                    {/* Botão de Atalho WhatsApp */}
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Abrir WhatsApp"
                      >
                        <MessageSquare size={18} />
                      </a>
                    )}
                  </div>

                  {/* Nome e Idade */}
                  <h3 className="font-bold text-stone-800 text-base line-clamp-1 group-hover:text-amber-700 transition-colors">
                    {patient.name}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5 font-medium flex items-center gap-1">
                    <User size={12} /> {age !== null ? `${age} anos` : 'Idade não inf.'} • {patient.biological_sex || 'Feminino'}
                  </p>

                  {/* Queixa Principal */}
                  <div className="mt-4 pt-3 border-t border-stone-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Queixa Principal</p>
                    <p className="text-xs text-stone-600 mt-0.5 line-clamp-2 leading-relaxed italic">
                      "{patient.chief_complaint || 'Nenhuma queixa registrada.'}"
                    </p>
                  </div>
                </div>

                {/* RODAPÉ DO CARD (AÇÕES) */}
                <div className="px-5 py-3 bg-stone-50/80 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-stone-400 font-mono">
                    ID: {patient.patient_id?.slice(-6)}
                  </span>

                  <div className="flex items-center gap-2">
                    {/* Botão Ativar / Desativar */}
                    <button
                      onClick={(e) => handleToggleStatus(patient, e)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        isActive 
                          ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      {isActive ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CADASTRO COMPLETO DE PACIENTE */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-stone-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-stone-200 flex justify-between items-center bg-stone-50">
              <div>
                <h2 className="text-xl font-bold text-stone-800">Cadastrar Novo Paciente</h2>
                <p className="text-xs text-stone-500 mt-0.5">Preencha os dados clínicos e demográficos completos.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreatePatient} className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
              
              {/* SEÇÃO DE FOTO DO PACIENTE */}
              <div className="flex flex-col items-center justify-center mb-2">
                <div className="relative">
                  {/* Bolinha da Foto */}
                  <div className="w-24 h-24 rounded-full border-2 border-dashed border-stone-300 flex items-center justify-center bg-stone-50 overflow-hidden">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-stone-400 text-sm text-center px-2">Sem Foto</span>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex gap-4 mt-3">
                  <label className="cursor-pointer text-xs text-amber-600 hover:text-amber-800 font-bold transition-colors">
                    <span className="flex items-center gap-1">
                      📷 Tirar Foto
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="user" 
                      className="hidden" 
                      onChange={handlePhotoUpload} 
                    />
                  </label>

                  <label className="cursor-pointer text-xs text-stone-500 hover:text-stone-700 font-bold transition-colors">
                    <span className="flex items-center gap-1">
                      📁 Enviar Arquivo
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handlePhotoUpload} 
                    />
                  </label>
                </div>
              </div>

              {/* SEÇÃO 1: Dados Pessoais */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-1.5">
                  <User size={14} /> 1. Informações Pessoais
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Willian Rafael de Oliveira"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Data de Nascimento</label>
                    <input
                      type="date"
                      value={formData.birth_date}
                      onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500 text-stone-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">RG / CPF</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={formData.rg_cpf}
                      onChange={e => setFormData({ ...formData, rg_cpf: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Sexo Biológico (Fonoaudiológico)</label>
                    <select
                      value={formData.biological_sex}
                      onChange={e => setFormData({ ...formData, biological_sex: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    >
                      <option value="feminino">Feminino</option>
                      <option value="masculino">Masculino</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Identidade de Gênero</label>
                    <select
                      value={formData.gender_identity}
                      onChange={e => setFormData({ ...formData, gender_identity: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    >
                      <option value="cisgênero">Cisgênero</option>
                      <option value="transgênero">Transgênero</option>
                      <option value="não-binário">Não-Binário</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: Contato & Endereço */}
              <div className="pt-4 border-t border-stone-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-1.5">
                  <Phone size={14} /> 2. Contato & Localização
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">E-mail</label>
                    <input
                      type="email"
                      placeholder="paciente@email.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Telefone (WhatsApp)</label>
                    <input
                      type="text"
                      placeholder="(19) 99999-9999"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Endereço Residencial</label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro, cidade - UF"
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 3: Responsável Legal */}
              <div className="pt-4 border-t border-stone-100">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="has_resp"
                    checked={formData.has_responsible}
                    onChange={e => setFormData({ ...formData, has_responsible: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300"
                  />
                  <label htmlFor="has_resp" className="text-xs font-bold text-stone-700 cursor-pointer">
                    Paciente possui Responsável Legal (Menor de idade ou Dependente)
                  </label>
                </div>

                {formData.has_responsible && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-200/60 animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-bold text-stone-600 block mb-1">Nome do Responsável</label>
                      <input
                        type="text"
                        placeholder="Nome completo"
                        value={formData.responsible.name}
                        onChange={e => setFormData({
                          ...formData,
                          responsible: { ...formData.responsible, name: e.target.value }
                        })}
                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-stone-600 block mb-1">Parentesco</label>
                      <input
                        type="text"
                        placeholder="Mãe, Pai, Tutor..."
                        value={formData.responsible.relationship}
                        onChange={e => setFormData({
                          ...formData,
                          responsible: { ...formData.responsible, relationship: e.target.value }
                        })}
                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-stone-600 block mb-1">CPF do Responsável</label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={formData.responsible.cpf}
                        onChange={e => setFormData({
                          ...formData,
                          responsible: { ...formData.responsible, cpf: e.target.value }
                        })}
                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 4: Saúde Vocal & IA */}
              <div className="pt-4 border-t border-stone-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-1.5">
                  <FileText size={14} /> 3. Demanda Clínica & IA Contextual
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Profissão / Demanda Vocal</label>
                    <input
                      type="text"
                      placeholder="Ex: Professor (uso vocal intenso 8h/dia)"
                      value={formData.profession_vocal_demand}
                      onChange={e => setFormData({ ...formData, profession_vocal_demand: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Diagnóstico Otorrinolaringológico</label>
                    <input
                      type="text"
                      placeholder="Ex: Fenda Glótica, Nódulos..."
                      value={formData.otorrhoea_diagnosis}
                      onChange={e => setFormData({ ...formData, otorrhoea_diagnosis: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Queixa Principal *</label>
                    <textarea
                      rows={2}
                      placeholder="Relato principal do paciente sobre a voz ou disfagia..."
                      value={formData.chief_complaint}
                      onChange={e => setFormData({ ...formData, chief_complaint: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Interesses do Paciente (Para Personalização da IA)</label>
                    <input
                      type="text"
                      placeholder="Ex: Futebol, música sertaneja, jogos de videogame, dinossauros..."
                      value={formData.interests}
                      onChange={e => setFormData({ ...formData, interests: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-stone-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-600 font-semibold text-sm hover:bg-stone-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm shadow-md transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Cadastrar Paciente'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}