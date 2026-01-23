<template>
  <div class="h-64 w-full">
    <VChart :option="option" autoresize class="chart" />
  </div>
</template>

<script setup lang="ts">

const props = defineProps<{
  data: {
    count6: number;
    count5: number;
    count4: number;
    totalPulls: number;
  }
}>();


const option = computed(() => {
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: {
        color: '#71717a' // 适配暗色模式
      }
    },
    series: [
      {
        name: '稀有度分布',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold'
          }
        },
        data: [
          { value: props.data.count6, name: '6★', itemStyle: { color: '#ff8904' } }, 
          { value: props.data.count5, name: '5★', itemStyle: { color: '#fdc700' } }, 
          { value: props.data.count4, name: '4★', itemStyle: { color: '#ad46ff' } }, 
        ]
      }
    ]
  };
});
</script>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}
</style>