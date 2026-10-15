import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, User, Phone, MessageSquare, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

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

export default function Patients() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [ageGroupFilter, setAgeGroupFilter] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [photoPreview, setPhotoPreview] = useState(null);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients'],
    queryFn: async () => (await api.get('/patients')).data || []
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ patientId, newStatus }) => (await api.patch(`/patients/${patientId}`, { status: newStatus })).data,
    onSuccess: (_, { newStatus }) => {
      toast.success(newStatus === 'active' ? 'Paciente reativado!' : 'Paciente marcado como inativo.');
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: () => toast.error('Erro ao alterar status do paciente.')
  });

  const createPatientMutation = useMutation({
    mutationFn: async (payload) => (await api.post('/patients', payload)).data,
    onSuccess: () => {
      toast.success('Paciente cadastrado com sucesso!');
      setIsModalOpen(false);
      setFormData(initialForm);
      setPhotoPreview(null);
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: () => toast.error('Erro ao cadastrar paciente.')
  });

  const handleToggleStatus = (patient, e) => {
    e.stopPropagation();
    const newStatus = patient.status === 'active' ? 'inactive' : 'active';
    toggleStatusMutation.mutate({ patientId: patient.patient_id, newStatus });
  };

  const handleCreatePatient = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error('O Nome Completo é obrigatório.');
    createPatientMutation.mutate({
      ...formData,
      age: calculateAge(formData.birth_date),
      photo_url: photoPreview || ''
    });
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const matchesSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.chief_complaint?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.rg_cpf?.includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER DA PÁGINA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 tracking-tight font-heading">Gestão de Pacientes</h1>
          <p className="text-sm text-stone-500 mt-1">
            {filteredPatients.length} paciente(s) localizado(s)
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-[#D46F54] hover:bg-[#B75C46] text-white px-5 py-3 rounded-xl font-bold shadow-md transition-all cursor-pointer"
        >
          <Plus size={18} /> Novo Paciente
        </button>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, queixa ou CPF..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-[#D46F54] transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-stone-50 border border-stone-200 text-stone-700 text-sm font-medium rounded-xl px-3 py-2.5 outline-none focus:border-[#D46F54]"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Somente Ativos</option>
            <option value="inactive">Somente Inativos</option>
          </select>

          <select
            value={ageGroupFilter}
            onChange={e => setAgeGroupFilter(e.target.value)}
            className="bg-stone-50 border border-stone-200 text-stone-700 text-sm font-medium rounded-xl px-3 py-2.5 outline-none focus:border-[#D46F54]"
          >
            <option value="all">Todas as Idades</option>
            <option value="child">Infantil (0 - 12 anos)</option>
            <option value="teen">Adolescente (13 - 17 anos)</option>
            <option value="adult">Adulto (18 - 59 anos)</option>
            <option value="senior">Idoso (60+ anos)</option>
          </select>
        </div>
      </div>

      {/* GALERIA EM GRID */}
      {isLoading ? (
        <div className="text-center py-16 text-stone-400 animate-pulse font-medium">
          Carregando lista de pacientes...
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-stone-300 p-12 text-center text-stone-500">
          <User size={40} className="mx-auto mb-3 text-stone-300" />
          <p className="font-bold text-lg text-stone-700">Nenhum paciente encontrado</p>
          <p className="text-sm text-stone-400 mt-1">Tente ajustar os filtros ou cadastre um novo paciente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredPatients.map(patient => {
            const age = patient.age ?? calculateAge(patient.birth_date);
            const isActive = patient.status === 'active';
            const cleanPhone = patient.phone?.replace(/\D/g, '');
            const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

            return (
              <div
                key={patient.patient_id}
                onClick={() => navigate(`/patients/${patient.patient_id}`)}
                className={`bg-white rounded-3xl border transition-all duration-200 hover:shadow-lg cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                  isActive
                    ? 'border-stone-200 hover:border-[#D46F54]/50'
                    : 'border-stone-200 bg-stone-50/60 opacity-75'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="relative shrink-0">
                      {patient.photo_url ? (
                        <img
                          src={patient.photo_url}
                          alt={patient.name}
                          className="w-12 h-12 rounded-full object-cover border border-stone-200 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center font-bold text-lg border border-[#D46F54]/20 shadow-sm font-heading">
                          {patient.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          isActive ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        title={isActive ? "Paciente Ativo" : "Paciente Inativo"}
                      />
                    </div>

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

                  <h3 className="font-bold text-stone-800 text-base line-clamp-1 group-hover:text-[#D46F54] transition-colors">
                    {patient.name}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5 font-medium flex items-center gap-1 capitalize">
                    <User size={12} /> {age !== null ? `${age} anos` : 'Idade não inf.'} • {patient.biological_sex || 'Feminino'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-stone-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Queixa Principal</p>
                    <p className="text-xs text-stone-600 mt-0.5 line-clamp-2 leading-relaxed italic">
                      "{patient.chief_complaint || 'Nenhuma queixa registrada.'}"
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3 bg-stone-50/80 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-stone-400 font-mono">
                    ID: {patient.patient_id?.slice(-6)}
                  </span>
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
            );
          })}
        </div>
      )}

      {/* MODAL DE CADASTRO COMPLETO DE PACIENTE */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-stone-200">
            
            <div className="p-6 border-b border-stone-200 flex justify-between items-center bg-stone-50">
              <div>
                <h2 className="text-xl font-bold text-stone-800 font-heading">Cadastrar Novo Paciente</h2>
                <p className="text-xs text-stone-500 mt-0.5">Preencha os dados clínicos e demográficos completos.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
              
              {/* FOTO */}
              <div className="flex flex-col items-center justify-center mb-2">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-stone-300 flex items-center justify-center bg-stone-50 overflow-hidden">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-stone-400 text-xs font-bold text-center px-2">Sem Foto</span>
                  )}
                </div>
                <div className="flex gap-4 mt-3">
                  <label className="cursor-pointer text-xs text-[#D46F54] hover:text-[#B75C46] font-bold transition-colors">
                    📷 Tirar Foto
                    <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                  <label className="cursor-pointer text-xs text-stone-500 hover:text-stone-700 font-bold transition-colors">
                    📁 Enviar Arquivo
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>
              </div>

              {/* SEÇÃO 1: Dados Pessoais */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#D46F54] mb-3 flex items-center gap-1.5">
                  <User size={14} /> 1. Informações Pessoais
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Maria Clara de Souza"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Data de Nascimento</label>
                    <input
                      type="date"
                      value={formData.birth_date}
                      onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54] text-stone-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">RG / CPF</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={formData.rg_cpf}
                      onChange={e => setFormData({ ...formData, rg_cpf: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Sexo Biológico (Fonoaudiológico)</label>
                    <select
                      value={formData.biological_sex}
                      onChange={e => setFormData({ ...formData, biological_sex: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
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
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    >
                      <option value="Cisgênero">Cisgênero</option>
                      <option value="Transgênero">Transgênero</option>
                      <option value="Não-Binário">Não-Binário</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: Contato */}
              <div className="pt-4 border-t border-stone-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#D46F54] mb-3 flex items-center gap-1.5">
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
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Telefone (WhatsApp)</label>
                    <input
                      type="text"
                      placeholder="(19) 99999-9999"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Endereço Residencial</label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro, cidade - UF"
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
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
                    className="w-4 h-4 rounded accent-[#D46F54]"
                  />
                  <label htmlFor="has_resp" className="text-xs font-bold text-stone-700 cursor-pointer">
                    Paciente possui Responsável Legal (Menor de idade ou Dependente)
                  </label>
                </div>

                {formData.has_responsible && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-[#F3E7E4]/40 rounded-2xl border border-[#D46F54]/30 animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-bold text-stone-600 block mb-1">Nome do Responsável</label>
                      <input
                        type="text"
                        placeholder="Nome completo"
                        value={formData.responsible.name}
                        onChange={e => setFormData({ ...formData, responsible: { ...formData.responsible, name: e.target.value } })}
                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-[#D46F54]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-stone-600 block mb-1">Parentesco</label>
                      <input
                        type="text"
                        placeholder="Mãe, Pai, Tutor..."
                        value={formData.responsible.relationship}
                        onChange={e => setFormData({ ...formData, responsible: { ...formData.responsible, relationship: e.target.value } })}
                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-[#D46F54]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-stone-600 block mb-1">CPF do Responsável</label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={formData.responsible.cpf}
                        onChange={e => setFormData({ ...formData, responsible: { ...formData.responsible, cpf: e.target.value } })}
                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-[#D46F54]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 4: Demanda Clínica */}
              <div className="pt-4 border-t border-stone-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#D46F54] mb-3 flex items-center gap-1.5">
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
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-600 block mb-1">Diagnóstico Otorrinolaringológico</label>
                    <input
                      type="text"
                      placeholder="Ex: Fenda Glótica, Nódulos..."
                      value={formData.otorrhoea_diagnosis}
                      onChange={e => setFormData({ ...formData, otorrhoea_diagnosis: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Queixa Principal *</label>
                    <textarea
                      rows={2}
                      placeholder="Relato principal do paciente sobre a voz..."
                      value={formData.chief_complaint}
                      onChange={e => setFormData({ ...formData, chief_complaint: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54] resize-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-stone-600 block mb-1">Interesses do Paciente (Para Personalização da IA)</label>
                    <input
                      type="text"
                      placeholder="Ex: Futebol, música, jogos, dinossauros..."
                      value={formData.interests}
                      onChange={e => setFormData({ ...formData, interests: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-sm outline-none focus:border-[#D46F54]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-600 font-bold text-sm hover:bg-stone-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createPatientMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold text-sm shadow-md transition-colors disabled:opacity-50"
                >
                  {createPatientMutation.isPending ? 'Salvando...' : 'Cadastrar Paciente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}