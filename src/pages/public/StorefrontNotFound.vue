<template>
    <div class="not-found-container">
        <div class="content">
            <h1 class="error-code">404</h1>
            <h2 class="title">Página Não Encontrada</h2>
            <p class="description">
                Ops! A página que você está procurando não existe ou foi movida.
            </p>

            <router-link :to="-1" class="btn-home">
                Voltar para a Início
            </router-link>
        </div>
    </div>
</template>

<script setup>
// Lógica do componente (se necessária no futuro)
</script>

<style scoped>
.not-found-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 70vh;
    padding: 2rem;
    text-align: center;
}

.content {
    max-width: 450px;
}

.error-code {
    font-size: 6rem;
    font-weight: 800;
    margin: 0;
    color: #2563eb;
    line-height: 1;
}

.title {
    font-size: 1.75rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem;
    color: #1f2937;
}

.description {
    font-size: 1rem;
    color: #6b7280;
    margin-bottom: 2rem;
}

.btn-home {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background-color: #2563eb;
    color: #ffffff;
    font-weight: 500;
    border-radius: 0.5rem;
    text-decoration: none;
    transition: background-color 0.2s ease;
}

.btn-home:hover {
    background-color: #1d4ed8;
}
</style>