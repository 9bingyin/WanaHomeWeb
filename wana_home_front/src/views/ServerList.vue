<template>
    <div style="max-width: 90%;width: fit-content;">
        <b-row align-h="between" cols="2">
            <b-col md="auto">
                <p>冰音のWanaHomeWeb</p>
            </b-col>
            <b-col class="text-right" md="auto">
                <b-btn size="sm" variant="outline-info refresh-button" @click="update()">
                    <b-icon-arrow-clockwise/>
                </b-btn>
            </b-col>
        </b-row>
        <b-row cols="1" cols-md="2">
            <b-col class="text-center">
                <p><b>该网站所有数据均为玩家自发上传</b></p>
                <p>原项目：<a href="https://github.com/nyaoouo/WanaHomeWeb" target="_blank">https://github.com/nyaoouo/WanaHomeWeb</a></p>
                <p><a href="https://wanahomeweb.statuspage.io" target="_blank">状态页</a>（服务状态监控及维护通知）</p>
                <p>当前版本：国服6.20a</p>
                <p>使用方式可查看<a href="https://www.yuque.com/9bingyin/wanahome/ngld" target="_blank">教程</a></p>
                <p>令牌下载链接：<a href="https://cowtransfer.com/s/374e0db95a004c" target="_blank">点击下载</a> <a href="http://bit.ly/3XGSHPc" target="_blank">备用下载</a></p>
                <p>数据库公开下载链接（每天凌晨3点更新数据）：<a href="http://bit.ly/3iFL7Wd" target="_blank">点击下载</a></p>
                <p>友情推荐：<a href="https://house.ffxiv.cyou/" target="_blank">艾欧泽亚售楼中心</a></p>
            </b-col>
            <b-col>
                <b-col v-for="dc in dc_server" :key="dc.dc_name" class="shadow-sm rounded m-2 p-2">
                    {{ dc.dc_name }}
                    <div>
                        <b-btn class="m-1 dc-button" v-for="(w_name,w_id) in dc.servers"
                               :key="w_id" size="sm" variant="success" :disabled="!(w_id in servers)"
                               v-b-tooltip.hover.top :title="`最近更新：${time_diff(servers[w_id],false)}前`"
                               @click="$router.push({name:'State',params:{server:w_id}})">
                            {{ w_name }}
                            <b-badge v-if="w_id in servers">{{ time_diff(servers[w_id]) }}</b-badge>
                        </b-btn>
                    </div>
                </b-col>
            </b-col>
        </b-row>
    </div>
</template>

<script lang="ts">
import {Component, Vue} from 'vue-property-decorator';
import {get_server_list} from "@/axios";
import {dc_server} from "@/libs/WardLandDefine";
import {time_diff} from "@/libs/Utils";

@Component({
    components: {
    }
})
export default class ServerList extends Vue {
    servers: { [id: number]: number } = {};
    dc_server = dc_server

    time_diff=time_diff

    update() {
        get_server_list().then(res => {
            if (!res) return;
            this.servers = {};
            for (var server of res)
                this.servers[server.server] = server.last_update;
        });
    }

    mounted() {
        this.update();
    }
}
</script>

<style scoped>
.list_dc {
    background-color: rgba(255, 255, 255, 0.5)
}
</style>
