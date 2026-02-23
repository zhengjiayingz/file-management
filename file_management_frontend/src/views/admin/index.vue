<template>
  <div class="admin-dashboard">
    <el-container>
      <el-header height="60px" class="dashboard-header">
        <div class="header-left">
          <h2>系统管理控制台</h2>
        </div>
        <div class="header-right">
          <el-button @click="router.push('/')">返回首页</el-button>
        </div>
      </el-header>

      <el-main v-loading="loading">
        <!-- 概览卡片 -->
        <el-row :gutter="20" class="overview-cards">
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>总用户数</span>
                </div>
              </template>
              <div class="card-value">{{ stats?.users.total || 0 }}</div>
              <div class="card-desc">活跃用户: {{ stats?.users.active || 0 }}</div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>总存储使用</span>
                </div>
              </template>
              <div class="card-value">{{ formatSize(stats?.storage.totalUsed) }}</div>
              <div class="card-desc">文件总数: {{ stats?.files.total || 0 }}</div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>管理员人数</span>
                </div>
              </template>
              <div class="card-value">{{ stats?.users.roles['admin'] || 0 }}</div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>系统状态</span>
                </div>
              </template>
              <div class="card-value status-normal">运行中</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 图表区域 -->
        <el-row :gutter="20" class="charts-row">
          <el-col :span="12">
            <el-card shadow="hover" class="chart-card">
              <template #header>
                <div class="card-header">
                  <span>文件类型分布</span>
                </div>
              </template>
              <div ref="fileTypeChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="hover" class="chart-card">
              <template #header>
                <div class="card-header">
                  <span>存储使用排行 (Top 5)</span>
                </div>
              </template>
              <div ref="storageRankChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 操作日志表格 -->
        <el-row class="logs-row">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>最近操作日志</span>
                </div>
              </template>
              <el-table :data="stats?.logs.recent || []" style="width: 100%" stripe>
                <el-table-column prop="createdAt" label="时间" width="180">
                  <template #default="scope">
                    {{ new Date(scope.row.createdAt).toLocaleString() }}
                  </template>
                </el-table-column>
                <el-table-column prop="user.username" label="用户" width="120" />
                <el-table-column prop="operationType" label="操作类型" width="120">
                  <template #default="scope">
                    <el-tag>{{ scope.row.operationType }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="resourceType" label="资源类型" width="120" />
                <el-table-column prop="description" label="描述" />
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import { adminApi, type DashboardStats } from '@api/admin';
import { formatFileSize } from '@utils/fileUpload'; // 假设有一个公共的文件大小格式化函数

const router = useRouter();
const loading = ref(false);
const stats = ref<DashboardStats | null>(null);

const fileTypeChartRef = ref<HTMLElement | null>(null);
const storageRankChartRef = ref<HTMLElement | null>(null);

let fileTypeChart: echarts.ECharts | null = null;
let storageRankChart: echarts.ECharts | null = null;

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    stats.value = await adminApi.getDashboardStats();
    await nextTick();
    initCharts();
  } catch (error: any) {
    ElMessage.error('加载统计数据失败: ' + (error.message || '未知错误'));
  } finally {
    loading.value = false;
  }
};

// MIME 类型友好名称映射
const mimeTypeNames: Record<string, string> = {
  // 图片
  'image/png': 'PNG 图片',
  'image/jpeg': 'JPEG 图片',
  'image/gif': 'GIF 图片',
  'image/webp': 'WebP 图片',
  'image/svg+xml': 'SVG 图片',
  'image/bmp': 'BMP 图片',
  // 视频
  'video/mp4': 'MP4 视频',
  'video/webm': 'WebM 视频',
  'video/ogg': 'OGG 视频',
  'video/quicktime': 'MOV 视频',
  'video/x-msvideo': 'AVI 视频',
  'video/x-matroska': 'MKV 视频',
  // 音频
  'audio/mpeg': 'MP3 音频',
  'audio/ogg': 'OGG 音频',
  'audio/wav': 'WAV 音频',
  'audio/flac': 'FLAC 音频',
  // 文档
  'application/pdf': 'PDF 文档',
  'application/msword': 'Word 文档',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word 文档',
  'application/vnd.ms-excel': 'Excel 表格',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel 表格',
  'application/vnd.ms-powerpoint': 'PPT 演示',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPT 演示',
  // 文本
  'text/plain': '纯文本',
  'text/plain; charset=utf-8': '纯文本',
  'text/html': 'HTML 文件',
  'text/css': 'CSS 文件',
  'text/javascript': 'JavaScript',
  'application/json': 'JSON 文件',
  'application/xml': 'XML 文件',
  // 压缩包
  'application/zip': 'ZIP 压缩包',
  'application/x-rar-compressed': 'RAR 压缩包',
  'application/x-7z-compressed': '7z 压缩包',
  'application/gzip': 'GZ 压缩包',
};

// 获取友好的文件类型名称
const getFriendlyTypeName = (mimeType: string): string => {
  // 先尝试精确匹配
  if (mimeTypeNames[mimeType]) {
    return mimeTypeNames[mimeType];
  }

  // 尝试去掉 charset 后匹配
  const baseType = mimeType.split(';')[0]?.trim() || mimeType;
  if (mimeTypeNames[baseType]) {
    return mimeTypeNames[baseType];
  }

  // 根据主类型返回通用名称
  const [mainType, subType] = baseType.split('/');
  if (mainType === 'image') return '图片';
  if (mainType === 'video') return '视频';
  if (mainType === 'audio') return '音频';
  if (mainType === 'text') return '文本';

  // 返回简化的子类型
  if (subType) {
    // 处理复杂的子类型名称
    if (subType.includes('word')) return 'Word 文档';
    if (subType.includes('excel') || subType.includes('spreadsheet')) return 'Excel 表格';
    if (subType.includes('powerpoint') || subType.includes('presentation')) return 'PPT 演示';
    if (subType.includes('zip') || subType.includes('compressed')) return '压缩包';

    return subType.split('.').pop() || subType;
  }

  return mimeType;
};

// 初始化图表
const initCharts = () => {
  if (!stats.value) return;

  // 1. 文件类型饼图
  if (fileTypeChartRef.value) {
    fileTypeChart = echarts.init(fileTypeChartRef.value);

    // 使用友好名称，并合并相同类型
    const typeMap = new Map<string, number>();
    stats.value.files.types.forEach(item => {
      const friendlyName = getFriendlyTypeName(item.mimeType);
      typeMap.set(friendlyName, (typeMap.get(friendlyName) || 0) + item._count.id);
    });

    const typeData = Array.from(typeMap.entries()).map(([name, value]) => ({
      name,
      value
    }));

    fileTypeChart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} 个 ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      series: [
        {
          name: '文件类型',
          type: 'pie',
          radius: ['40%', '70%'], // 改为环形图，更美观
          center: ['60%', '50%'], // 右移，给图例留空间
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: true,
            formatter: '{b}\n{d}%'
          },
          labelLine: {
            show: true
          },
          data: typeData,
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    });
  }

  // 2. 存储排名柱状图
  if (storageRankChartRef.value) {
    storageRankChart = echarts.init(storageRankChartRef.value);

    // 转换存储大小为 MB 用于显示
    const rankData = stats.value.storage.ranking.map(item => ({
      name: item.username,
      value: (Number(item.storageUsed) / (1024 * 1024)).toFixed(2) // MB
    }));

    storageRankChart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      xAxis: {
        type: 'category',
        data: rankData.map(i => i.name)
      },
      yAxis: {
        type: 'value',
        name: '存储使用 (MB)'
      },
      series: [
        {
          data: rankData.map(i => i.value),
          type: 'bar',
          showBackground: true,
          backgroundStyle: {
            color: 'rgba(180, 180, 180, 0.2)'
          },
          label: {
            show: true,
            position: 'top'
          }
        }
      ]
    });
  }
};

// 格式化大小辅助函数 (如果是 string 类型的 BigInt)
const formatSize = (sizeStr?: string | number) => {
  if (!sizeStr) return '0 B';
  const size = Number(sizeStr);
  return formatFileSize(size);
};

// 窗口大小改变时重绘图表
const handleResize = () => {
  fileTypeChart?.resize();
  storageRankChart?.resize();
};

onMounted(() => {
  loadData();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  fileTypeChart?.dispose();
  storageRankChart?.dispose();
});
</script>

<style scoped>
.admin-dashboard {
  background-color: #f5f7fa;
  min-height: 100vh;
}

.dashboard-header {
  background-color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
}

.overview-cards {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin: 10px 0;
}

.card-desc {
  font-size: 14px;
  color: #909399;
}

.status-normal {
  color: #67c23a;
}

.charts-row {
  margin-bottom: 20px;
}

.chart-container {
  height: 350px;
  width: 100%;
}

.logs-row {
  margin-bottom: 20px;
}
</style>
